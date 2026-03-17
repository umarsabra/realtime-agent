import "dotenv/config";
import http from "http";
import express, { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import { AsteriskConnection } from "../service/asterisk";
import { AgentTool, OpenAIAgent } from "../service/openai";
import { tools, instructions, buildEndCallTool } from "../agents/eshara";






const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-realtime";
const PUBLIC_WSS_URL = process.env.PUBLIC_WSS_URL ?? ""; // e.g. wss://your-domain.com/media

const app = express();


app.use(express.urlencoded({ extended: false }));
app.use(express.json());


// Health check endpoint
app.get("/", (_req: Request, res: Response) => {
    res
        .type("text/plain")
        .send("ok");
});


// Twilio webhook endpoint to receive calls and stream media
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






wss.on("connection", (ws: WebSocket) => {
    const connection = new AsteriskConnection(ws);

    if (!OPENAI_API_KEY) {
        connection.close(1011, "Missing OPENAI_API_KEY");
        return;
    }

    const agent = new OpenAIAgent({
        name: "Mariam",
        instructions,
        connection,
        token: process.env.OPENAI_API_KEY ?? "",
        onAudioBuffer: (buffer) => connection.sendAudio(buffer),
        onUserStartedSpeaking: () => connection.clear(),
        model: OPENAI_MODEL,
    })


    let closed = false;
    let hangupTimerId: NodeJS.Timeout | null = null;



    const close = (reason?: string) => {
        if (closed) return;
        closed = true;
        if (hangupTimerId) {
            clearTimeout(hangupTimerId);
            hangupTimerId = null;
        }
        if (reason) console.log("[bridge] closing:", reason);
        connection.close();
        agent.close();
    };




    const scheduleHangup = (reason?: string, delayMs = 2500) => {
        if (closed || hangupTimerId) return;
        hangupTimerId = setTimeout(() => {
            hangupTimerId = null;
            connection.hangup()
                .then(() => {
                    if (reason) {
                        console.log("[bridge] requested hangup:", reason);
                    }
                })
                .catch((err) => {
                    console.error("[bridge] failed to hang up call:", err);
                    close(`${reason ?? "agent end_call"} fallback close`);
                });
        }, delayMs);
    };


    // Register tools
    agent.registerTools([...tools, buildEndCallTool(scheduleHangup)]);


    // Start the agent
    agent.connect()


    // Handle closed connections and errors from Agent WS
    agent.on("close", () => close("[bridge] agent closed"));


    // greet the caller when the assistant starts
    agent.on("assistantStarted", () => {
        agent.send(
            {
                type: "conversation.item.create",
                item: {
                    type: "message",
                    role: "system",
                    content: [
                        {
                            type: "input_text",
                            text:
                                "Please greet the caller in clear Egyptian Arabic, introduce yourself as Mariam from Eshara, and ask how you can help.",
                        },
                    ],
                },
            }
        );
        agent.sendResponseCreate("Greet the caller and ask how you can help.");
    });


    // Save the Asterisk media connection ids once the websocket channel is fully started.
    connection.onStart((e) => console.log("[bridge] connection started: ", e));


    // When we receive media, we stream it directly to Agent as it arrives for the most real-time experience.
    connection.onMedia((buffer) => {
        if (!agent.ready) return;
        agent.sendAudio(buffer);
    });


    // Cleanup if either side closes
    connection.onClose(() => close("connection closed"));


    // When Asterisk closes the media websocket, clean up the OpenAI side as well.
    connection.onStop(() => close("connection stopped"));


    // Log and close on Asterisk WS errors
    connection.onError((err) => close("connection error"));

});







// Start the server
export default server;
