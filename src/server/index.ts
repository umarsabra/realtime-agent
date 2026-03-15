import "dotenv/config";
import http from "http";
import express, { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import { AsteriskConnection } from "../service/asterisk";
import { OpenAIAgent } from "../service/openai";
import { tools, instructions } from "../agents/eshara";





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
    console.log("New Asterisk WebSocket connection established.");
    const connection = new AsteriskConnection(ws);
    let closed = false;

    if (!OPENAI_API_KEY) {
        connection.close(1011, "Missing OPENAI_API_KEY");
        return;
    }

    const agent = new OpenAIAgent({
        name: "Mariam",
        instructions,
        token: process.env.OPENAI_API_KEY ?? "",
        onAudioBuffer: (buffer) => connection.sendAudio(buffer),
        onUserStartedSpeaking: () => connection.clear(),
        model: OPENAI_MODEL,
    })
    agent.registerTools(tools);

    const close = (reason?: string) => {
        if (closed) return;
        closed = true;
        if (reason) console.log("[bridge] closing:", reason);
        connection.close();
        agent.close();
    };


    // handle closed connections and errors from Agent WS
    agent.on("close", () => close("openai close"));


    // Save the Asterisk media connection ids once the websocket channel is fully started.
    connection.onStart((data) => {
        connection.setId(data.connection_id);
        connection.setCallId(data.channel_id);
    });


    // When we receive media from Twilio, we stream it directly to OpenAI as it arrives for the most real-time experience. In production, you might want to implement buffering and handle backpressure more robustly.
    connection.onMedia((buffer) => {
        if (!agent.ready) return;
        agent.sendAudio(buffer);
    });


    // When Asterisk closes the media websocket, clean up the OpenAI side as well.
    connection.onStop(() => close("asterisk stop"));


    // Log and close on Asterisk WS errors
    connection.onError((err) => close("asterisk error"));


    // Cleanup if either side closes
    connection.onClose(() => close("asterisk close"));

});







// Start the server
export default server;
