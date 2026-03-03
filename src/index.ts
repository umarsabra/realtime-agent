import "dotenv/config";
import http from "http";
import express, { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";


// Your tool implementations (you already have these in Python)
// Make these return plain JSON-serializable objects.
import { getJobDetails, getJobUpdates, endCall } from "./tools";
import { buildSessionUpdate, instructions, tools } from "./utils/model";
import { safeJsonParse } from "./utils";
import { TwilioInboundEvent } from "./service/types";



const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-realtime";
const PUBLIC_WSS_URL = process.env.PUBLIC_WSS_URL ?? ""; // e.g. wss://your-domain.com/media

const PORT = Number(process.env.PORT ?? 4000);

const app = express();

// Twilio may POST x-www-form-urlencoded to your webhook
app.use(express.urlencoded({ extended: false }));
app.use(express.json());


// Health check endpoint
app.get("/", (_req: Request, res: Response) => {
    res
        .type("text/plain")
        .send("ok");
});


app.all("/twilio", (_req: Request, res: Response) => {
    if (!PUBLIC_WSS_URL) {
        res
            .status(500)
            .type("text/plain").send("Missing PUBLIC_WSS_URL");
        return;
    }

    // TwiML: <Response><Connect><Stream url="wss://.../media" /></Connect></Response>
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();
    const connect = twiml.connect();
    connect.stream({ url: PUBLIC_WSS_URL });
    res.type("text/xml").send(twiml.toString());
});


const server = http.createServer(app);


const wss = new WebSocketServer({ server, path: "/media" });
wss.on("connection", async (twilioWs: WebSocket) => {
    if (!OPENAI_API_KEY) {
        twilioWs.close(1011, "Missing OPENAI_API_KEY");
        return;
    }

    let streamSid: string | null = null;
    let callSid: string | null = null;

    const openaiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(OPENAI_MODEL)}`, {
        headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "OpenAI-Beta": "realtime=v1",
        },
    });



    const closeAll = (reason?: string) => {
        if (reason) console.log("[bridge] closing:", reason);
        try {
            if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
        } catch (err) {
            console.error("Error closing twilio ws:", err);
        }
        try {
            if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
        } catch (err) {
            console.error("Error closing openai ws:", err);
        }
    };


    const callArgsBuffer = new Map<string, string>();
    const pendingResponses = new Map<string, boolean>(); // track in-flight responses by call_id to prevent overlapping responses for the same tool call
    let assistantStarted = false;
    let sessionReady = false;


    async function handleFunctionCall(callId: string | undefined, fnName: string | undefined, argsJson: string) {
        if (!callId || !fnName) return;

        let args: any = {};
        const buffered = callArgsBuffer.get(callId);
        const effectiveArgsJson =
            (argsJson && argsJson !== "{}" ? argsJson : buffered) ?? argsJson ?? "{}";

        try {
            args = JSON.parse(effectiveArgsJson || "{}");
        } catch {
            args = {};
        }

        let result: any;
        try {
            if (fnName === "get_job_details") {
                result = await getJobDetails(String(args.job_id ?? ""));
            } else if (fnName === "get_job_updates") {
                result = await getJobUpdates(String(args.job_id ?? ""));
            } else if (fnName === "end_call") {
                // You can make this hang up in Twilio using REST API if you want,
                // but for simplicity we'll just send a goodbye message and let the caller hang up
                result = await endCall(callSid ?? "", String(args.reason ?? "caller requested"));
            } else {
                result = { status: "error", message: `Unknown tool: ${fnName}` };
            }
        } catch (e: any) {
            result = { status: "error", message: e?.message ?? String(e) };
        } finally {
            console.log(`[tool call] ${fnName}(${effectiveArgsJson})`);
        }

        // Send tool output back to OpenAI
        if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(
                JSON.stringify({
                    type: "conversation.item.create",
                    item: {
                        type: "function_call_output",
                        call_id: callId,
                        output: JSON.stringify(result),
                    },
                })
            );
        }

        // cleanup buffer
        callArgsBuffer.delete(callId);

        // Ask the model to speak the result nicely
        if (fnName === "get_job_details") {
            setTimeout(() => sendResponseCreate("Tell the caller the job details in plain English."), 1000)
        } else if (fnName === "get_job_updates") {
            setTimeout(() => sendResponseCreate("Tell the caller the job updates in plain English."), 1000)
        }
    }


    function sendResponseCreate(instructions: string) {
        if (!openaiWs || openaiWs.readyState !== WebSocket.OPEN) {
            console.warn("[bridge] cannot send response.create, OpenAI WS not open");
            return;
        }

        // Prevent sending a new response.create if there's already a pending response for the current call
        if (pendingResponses.size > 0) {
            console.warn("[bridge] already have pending response for call_ids:", Array.from(pendingResponses.keys()));
            return;
        }

        openaiWs.send(
            JSON.stringify({
                type: "response.create",
                response: { instructions },
            })
        );
        console.log("[bridge] sent response.create with instructions:", instructions);
    }


    // send initial session update to set model, turn detection, tools, etc.
    openaiWs.on("open", () => {
        openaiWs.send(JSON.stringify(buildSessionUpdate()));
    });


    // log and close on OpenAI WS errors - you may want to implement more robust error handling and reconnection logic in production
    openaiWs.on("error", (err) => {
        console.error("[openai ws] error:", err);
        closeAll("openai error");
    });


    // Handle incoming messages/events from OpenAI
    openaiWs.on("message", async (data) => {
        const raw = typeof data === "string" ? data : data.toString("utf8");
        const serverEvent = safeJsonParse<any>(raw);
        if (!serverEvent) return;   // ignore non-json messages

        const t = serverEvent.type as string | undefined;

        if (t === "error") {
            console.error("[openai] error event:", serverEvent);
            return;
        }


        if (t === "session.created") {
            console.log("[openai] session started.");
            return;
        }

        // Ensure the session is ready and using the correct audio format before we start sending audio or tool calls
        if (t === "session.updated") {
            const session = serverEvent?.session ?? {};
            // Ensure audio format is mulaw/8k for Twilio
            if (session.output_audio_format && session.output_audio_format !== "g711_ulaw") {
                // If the model responded with a different audio format than we requested,
                // we need to update the session to use g711_ulaw for compatibility with Twilio
                console.warn("[openai] unexpected session update:", session);
                openaiWs.send(
                    JSON.stringify({
                        type: "session.update",
                        session: { input_audio_format: "g711_ulaw", output_audio_format: "g711_ulaw" },
                    })
                );
                return;
            }


            sessionReady = true;
            if (sessionReady && !assistantStarted) {
                // Seed a user message to make the assistant greet immediately
                openaiWs.send(
                    JSON.stringify({
                        type: "conversation.item.create",
                        item: {
                            type: "message",
                            role: "user",
                            content: [
                                {
                                    type: "input_text",
                                    text:
                                        "Please greet the caller in clear American English, introduce yourself as Wendy from Midwest Solutions Inc, and ask how you can help.",
                                },
                            ],
                        },
                    })
                );
                sendResponseCreate("Greet the caller and ask how you can help.");
                assistantStarted = true;
            }
            return;
        }


        // mark the response as pending when it's created so we can track it and prevent overlapping responses for the same tool call
        if (t === "response.created") {
            console.log("[openai] response created: ", serverEvent.response.id);
            pendingResponses.set(serverEvent.response.id, true);
            return;
        }


        // Audio deltas from OpenAI -> Twilio media frames
        if (
            t === "response.output_audio.delta" ||
            t === "response.audio.delta" ||
            t === "output_audio_buffer.delta"
        ) {
            const audioB64 = serverEvent.delta as string | undefined;
            if (audioB64 && streamSid && twilioWs.readyState === WebSocket.OPEN) {
                twilioWs.send(
                    JSON.stringify({
                        event: "media",
                        streamSid,
                        media: { payload: audioB64 },
                    })
                );
            }
            return;
        }


        // Streaming tool args {"call_id": "...", "delta": "..."}
        if (t === "response.function_call_arguments.delta") {
            const callId = serverEvent.call_id as string | undefined;
            const delta = serverEvent.delta as string | undefined;
            if (callId && delta) {
                callArgsBuffer.set(callId, (callArgsBuffer.get(callId) ?? "") + delta);
            }
            return;
        }

        // Handle end of tool args - you could trigger the tool execution here if you want, but we'll wait for the function_call item completion for simplicity
        if (t === "response.function_call_arguments.done") {
            const callId = serverEvent.call_id as string | undefined;
            if (callId && callArgsBuffer.has(callId)) {
                console.log("[openai] tool args done for call_id:", callId);
            }
            return;
        }


        // User started speaking
        if (t === "input_audio_buffer.speech_started") {
            console.log("[openai] user started speaking");
            twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
            if (pendingResponses.size > 0) {
                openaiWs.send(JSON.stringify({ type: "response.cancel" }));
            }
            return;
        }


        // User stopped speaking
        if (t === "input_audio_buffer.speech_stopped") {
            console.log("[openai] user stopped speaking");
            return;
        }


        // Log any response failures or cancellations and reset state so the model can respond to the next user input
        if (t === "response.failed") {
            console.warn(`[openai] response ${t}:`, serverEvent);
            pendingResponses.delete(serverEvent.response?.id);
            return;
        }


        // Clear any pending response state so the model can respond to the next user input without thinking there's still a pending response
        if (t === "response.cancelled") {
            console.log("[openai] response cancelled, cleared pending responses and in-flight audio", serverEvent);
            const itemId = serverEvent?.response?.output?.[0]?.id;
            const request = JSON.stringify({
                type: "conversation.item.truncate",
                item_id: itemId,
                content_index: 0,
                audio_end_ms: 1500 // truncate audio after 1.5 seconds
            });
            openaiWs.send(request);
            pendingResponses.clear();
            return;
        }



        // Fallback: sometimes tool calls appear at response.done instead of output_item.done,
        // so we check for any pending tool calls here as well to be safe
        if (t === "response.done") {
            if (pendingResponses.has(serverEvent.response?.id)) {
                pendingResponses.delete(serverEvent.response.id);
                console.log("[openai] marked response as completed for response.id:", serverEvent.response?.id);
            }


            const outputItems = serverEvent?.response?.output ?? [];
            for (const item of outputItems) {
                if (item?.type === "function_call") {
                    console.warn("[openai] found function_call item at response.done:", item);
                    await handleFunctionCall(item.call_id, item.name, item.arguments ?? "{}");
                }
            }
            return;
        }


        return;
    });











    // streaming media from Twilio -> OpenAI
    twilioWs.on("message", (data) => {
        const raw = typeof data === "string" ? data : data.toString("utf8");
        const event = safeJsonParse<TwilioInboundEvent | any>(raw);
        if (!event) {
            console.warn("[twilio] received non-json message:", raw);
            return;
        }

        if (event.event === "start") {
            streamSid = event.start?.streamSid ?? null;
            callSid = event.start?.callSid ?? null;
            console.log("[twilio] start streamSid:", streamSid, "callSid:", callSid);
            console.log("[twilio] mediaFormat:", event.start?.mediaFormat);
            return;
        }

        if (event.event === "media") {
            const payload = event.media?.payload;
            // send audio payloads from Twilio directly into the OpenAI WS as they arrive
            if (payload && openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: payload }));
            }
            return;
        }

        if (event.event === "stop") {
            console.log("[twilio] stop");
            closeAll("twilio stop");
            return;
        }
    });

    // Log and close on Twilio WS errors
    twilioWs.on("error", (err) => {
        console.error("[twilio ws] error:", err);
        closeAll("twilio error");
    });

    // Cleanup if either side closes
    twilioWs.on("close", () => closeAll("twilio close"));
    openaiWs.on("close", () => closeAll("openai close"));
});


// Start the server
server.listen(PORT, () => {
    console.log(`Server listening on :${PORT}`);
    console.log(`Twilio webhook: http://localhost:${PORT}/twilio`);
    console.log(`Media WS path: ws://localhost:${PORT}/media`);
});
