import "dotenv/config";
import http from "http";
import express, { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";


// Your tool implementations (you already have these in Python)
// Make these return plain JSON-serializable objects.
import { getJobDetails, getJobUpdates, endCall } from "./tools";
import { instructions, tools } from "./utils/model";
import { safeJsonParse } from "./utils";



const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-realtime";
const PUBLIC_WSS_URL = process.env.PUBLIC_WSS_URL ?? ""; // e.g. wss://your-domain.com/media

const PORT = Number(process.env.PORT ?? 4000);
const VAD_THRESHOLD = Number(process.env.VAD_THRESHOLD ?? 0.85);
const VAD_PREFIX_PADDING_MS = Number(process.env.VAD_PREFIX_PADDING_MS ?? 400);
const VAD_SILENCE_DURATION_MS = Number(process.env.VAD_SILENCE_DURATION_MS ?? 900);
const BARGE_IN_DEBOUNCE_MS = Number(process.env.BARGE_IN_DEBOUNCE_MS ?? 180);

const app = express();

// Twilio may POST x-www-form-urlencoded to your webhook
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

function buildSessionUpdate() {
    return {
        type: "session.update",
        session: {
            model: OPENAI_MODEL,
            modalities: ["audio", "text"],
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: "marin",
            turn_detection: {
                type: "server_vad",
                threshold: VAD_THRESHOLD,           // Higher = less sensitive to background noise
                prefix_padding_ms: VAD_PREFIX_PADDING_MS,
                silence_duration_ms: VAD_SILENCE_DURATION_MS,
                create_response: true,
                interrupt_response: true,
            },
            instructions,
            tools,
            tool_choice: "auto",
        },
    };
}

app.get("/", (_req: Request, res: Response) => {
    res.type("text/plain").send("ok");
});

app.all("/twilio", (_req: Request, res: Response) => {
    if (!PUBLIC_WSS_URL) {
        res.status(500).type("text/plain").send("Missing PUBLIC_WSS_URL");
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

type TwilioInboundEvent =
    | { event: "start"; start?: { streamSid?: string; callSid?: string; mediaFormat?: unknown } }
    | { event: "media"; media?: { payload?: string } }
    | { event: "stop" }
    | { event: string;[k: string]: unknown };



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

    const callArgsBuffer = new Map<string, string>();
    let assistantStarted = false;
    let sessionReady = false;

    const closeAll = (why?: string) => {
        if (why) console.log("[bridge] closing:", why);
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

    openaiWs.on("open", () => {
        openaiWs.send(JSON.stringify(buildSessionUpdate()));
    });

    openaiWs.on("error", (err) => {
        console.error("[openai ws] error:", err);
        closeAll("openai error");
    });

    twilioWs.on("error", (err) => {
        console.error("[twilio ws] error:", err);
        closeAll("twilio error");
    });



    // ---- Twilio -> OpenAI ----
    twilioWs.on("message", (data) => {
        const raw = typeof data === "string" ? data : data.toString("utf8");
        const event = safeJsonParse<TwilioInboundEvent | Record<string, any>>(raw);
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






    // ---- Tool call handler ----
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
                // You can make this hang up in Twilio using REST API if you want, but for simplicity we'll just send a goodbye message and let the caller hang up
                result = await endCall(callSid ?? "", String(args.reason ?? "caller requested"));
            } else {
                result = { status: "error", message: `Unknown tool: ${fnName}` };
            }
        } catch (e: any) {
            result = { status: "error", message: e?.message ?? String(e) };
        } finally {
            console.log(`[tool call] ${fnName}(${effectiveArgsJson}) =>`, result);
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

        callArgsBuffer.delete(callId);


        // Ask the model to speak the result nicely
        if (fnName === "get_job_details") {
            sendResponseCreate("Tell the caller the job details in plain English.");
        } else if (fnName === "get_job_updates") {
            sendResponseCreate("Tell the caller the job updates in plain English.");
        }
    }

    // ---- OpenAI -> Twilio ----
    let responseInProgress = false;
    let pendingResponseInstructions: string | null = null;
    let suppressOutputAudio = false;
    let userSpeaking = false;
    let bargeInTriggered = false;
    let bargeInTimer: ReturnType<typeof setTimeout> | null = null;

    // Track current assistant audio to support truncation on user barge-in
    let currentAudioItemId: string | null = null;
    let currentAudioSentMs = 0;
    let currentAudioStartTimeMs: number | null = null;

    function base64BytesLength(b64: string): number {
        let len = b64.length;
        if (len === 0) return 0;
        if (b64.endsWith("==")) len -= 2;
        else if (b64.endsWith("=")) len -= 1;
        return Math.floor((len * 3) / 4);
    }

    function resetAudioTracking() {
        currentAudioItemId = null;
        currentAudioSentMs = 0;
        currentAudioStartTimeMs = null;
    }

    function clearBargeInTimer() {
        if (bargeInTimer) {
            clearTimeout(bargeInTimer);
            bargeInTimer = null;
        }
    }

    function scheduleBargeIn() {
        if (!responseInProgress || bargeInTimer) return;
        bargeInTimer = setTimeout(() => {
            bargeInTimer = null;
            if (!responseInProgress) return;
            bargeInTriggered = true;
            interruptResponse("caller_barge_in");
        }, BARGE_IN_DEBOUNCE_MS);
    }

    function sendResponseCreate(instructions: string) {
        if (responseInProgress) {
            pendingResponseInstructions = instructions;
            return;
        }

        if (openaiWs.readyState === WebSocket.OPEN) {
            openaiWs.send(
                JSON.stringify({
                    type: "response.create",
                    response: { instructions },
                })
            );
            responseInProgress = true;
        }
    }



    function interruptResponse(_reason: string) {
        const hasAudioInFlight = currentAudioItemId !== null || currentAudioStartTimeMs !== null;
        if (!responseInProgress && !hasAudioInFlight) return;

        clearBargeInTimer();
        if (_reason === "caller_barge_in") {
            bargeInTriggered = true;
            console.log("[bridge] interrupting response due to caller barge-in");
        }

        // 1. Tell Twilio to dump its audio buffer
        if (streamSid && twilioWs.readyState === WebSocket.OPEN) {
            twilioWs.send(JSON.stringify({
                event: "clear",
                streamSid: streamSid
            }));
        }

        // 2. Ask the Realtime API to cancel the current response and stop sending audio
        if (openaiWs.readyState === WebSocket.OPEN && responseInProgress) {
            suppressOutputAudio = true;
            openaiWs.send(JSON.stringify({ type: "response.cancel" }));
        }

        // 3. Truncate the assistant's last response
        if (currentAudioItemId && currentAudioStartTimeMs !== null) {
            const elapsedMs = Date.now() - currentAudioStartTimeMs;
            const playedMs = Math.max(0, Math.min(currentAudioSentMs, elapsedMs));
            if (playedMs > 0 && openaiWs.readyState === WebSocket.OPEN) {
                openaiWs.send(JSON.stringify({
                    type: "conversation.item.truncate",
                    item_id: currentAudioItemId,
                    content_index: 0,
                    audio_end_ms: Math.floor(playedMs),
                }));
            }
        }

        // interrupt_response=true lets the server cancel; we just stop playback + truncate here.
        pendingResponseInstructions = null;
        resetAudioTracking();
    }






    openaiWs.on("message", async (data) => {
        const raw = typeof data === "string" ? data : data.toString("utf8");
        const serverEvent = safeJsonParse<any>(raw);
        if (!serverEvent) return;

        const t = serverEvent.type as string | undefined;

        if (t === "error") {
            console.error("[openai] error event:", serverEvent);
            return;
        }

        if (t === "session.created") {
            console.log("[openai] session created model:", serverEvent?.session?.model);
            return;
        }

        if (t === "session.updated") {
            const session = serverEvent?.session ?? {};
            // Ensure audio format is mulaw/8k for Twilio
            if (session.output_audio_format && session.output_audio_format !== "g711_ulaw") {
                openaiWs.send(
                    JSON.stringify({
                        type: "session.update",
                        session: { input_audio_format: "g711_ulaw", output_audio_format: "g711_ulaw" },
                    })
                );
                return;
            } else {
                console.warn("[openai] unexpected session update:", session);
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

        if (t === "response.created") {
            responseInProgress = true;
            suppressOutputAudio = false;
            bargeInTriggered = false;
            return;
        }



        // Audio deltas from OpenAI -> Twilio media frames
        if (
            t === "response.output_audio.delta" ||
            t === "response.audio.delta" ||
            t === "output_audio_buffer.delta"
        ) {
            if (suppressOutputAudio) return;
            const audioB64 = serverEvent.delta as string | undefined;
            const itemId = (serverEvent.item_id as string | undefined) ?? null;

            if (itemId && itemId !== currentAudioItemId) {
                currentAudioItemId = itemId;
                currentAudioSentMs = 0;
                currentAudioStartTimeMs = Date.now();
            } else if (currentAudioStartTimeMs === null) {
                currentAudioStartTimeMs = Date.now();
            }

            if (audioB64) {
                const bytes = base64BytesLength(audioB64);
                currentAudioSentMs += (bytes / 8000) * 1000;
            }

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



        // User barge-in detected by VAD - debounce to avoid background noise
        if (t === "input_audio_buffer.speech_started") {
            userSpeaking = true;
            scheduleBargeIn();
            return;
        }


        // User stopped speaking - reset barge-in state
        if (t === "input_audio_buffer.speech_stopped") {
            userSpeaking = false;
            clearBargeInTimer();
            return;
        }


        // Streaming tool args
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


        // Primary hook: tool call emitted as an item completion
        if (t === "response.output_item.done") {
            const item = serverEvent.item;
            if (item?.type === "function_call") {
                const callId = item.call_id as string | undefined;
                const fnName = item.name as string | undefined;
                const argsJson =
                    (callId ? callArgsBuffer.get(callId) : undefined) ?? (item.arguments as string) ?? "{}";
                await handleFunctionCall(callId, fnName, argsJson);
            }
            return;
        }




        // Fallback: sometimes tool calls appear at response.done
        if (t === "response.done") {
            responseInProgress = false;
            suppressOutputAudio = false;
            resetAudioTracking();
            clearBargeInTimer();
            if (pendingResponseInstructions && !userSpeaking && !bargeInTriggered) {
                const instructions = pendingResponseInstructions;
                pendingResponseInstructions = null;
                sendResponseCreate(instructions);
            } else {
                pendingResponseInstructions = null;
            }
            bargeInTriggered = false;

            const outputItems = serverEvent?.response?.output ?? [];
            for (const item of outputItems) {
                if (item?.type === "function_call") {
                    await handleFunctionCall(item.call_id, item.name, item.arguments ?? "{}");
                }
            }
            return;
        }


        if (t === "response.failed" || t === "response.cancelled") {
            responseInProgress = false;
            suppressOutputAudio = false;  // Ensure this is cleared
            resetAudioTracking();
            clearBargeInTimer();

            // **NEW: Don't force a new response, let VAD handle it naturally**
            // The model will respond when the user finishes speaking

            if (pendingResponseInstructions && !userSpeaking && !bargeInTriggered) {
                const instructions = pendingResponseInstructions;
                pendingResponseInstructions = null;
                sendResponseCreate(instructions);
            } else {
                pendingResponseInstructions = null;
            }
            bargeInTriggered = false;
            return;
        }

    });









    // Cleanup if either side closes
    twilioWs.on("close", () => closeAll("twilio close"));
    openaiWs.on("close", () => closeAll("openai close"));
});

server.listen(PORT, () => {
    console.log(`Server listening on :${PORT}`);
    console.log(`Twilio webhook: http://localhost:${PORT}/twilio`);
    console.log(`Media WS path: ws://localhost:${PORT}/media`);
});
