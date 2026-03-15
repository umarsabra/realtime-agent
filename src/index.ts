import "dotenv/config";
import http from "http";
import express, { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import Connection from "./service/Connection";
import { connectAri } from "./service/ari";
import { AsteriskConnection } from "./service/asterisk";
import { tools, instructions } from "./agents/eshara";
import { OpenAIAgent } from "./service/openai";



const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-realtime";
const PUBLIC_WSS_URL = process.env.PUBLIC_WSS_URL ?? ""; // e.g. wss://your-domain.com/media
const PORT = Number(process.env.PORT ?? 4000);

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
    handleConnection(connection);
});



const handleConnection = async (connection: Connection) => {
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
    agent.connect();


    const close = (reason?: string) => {
        if (reason) console.log("[bridge] closing:", reason);
        connection.close();
        agent.close();
    };


    agent.on("close", () => close("openai close"));

    // When Twilio signals the start of the stream, we save the callSid for later use and log the media format. In production, you might want to implement more robust handling of different media formats or other stream parameters.
    connection.onStart((data) => {
        connection.setId(data.start?.streamSid);
        connection.setCallId(data.start?.callSid);
    });


    // When we receive media from Twilio, we stream it directly to OpenAI as it arrives for the most real-time experience. In production, you might want to implement buffering and handle backpressure more robustly.
    connection.onMedia((buffer) => agent.sendAudio(buffer));


    // When Twilio signals the end of the stream, we close the OpenAI WS connection and clean up. In production, you might want to implement more graceful shutdown logic or allow the model to finish its response before closing.
    connection.onStop(() => close("twilio stop"));


    // Log and close on Twilio WS errors
    connection.onError((err) => close("twilio error"));


    // Cleanup if either side closes
    connection.onClose(() => close("twilio close"));
}






connectAri().catch((err) => {
    console.error("Error connecting to Asterisk ARI:", err);
});





// Start the server
server.listen(PORT, () => {
    console.log(`Server listening on :${PORT}`);
    console.log(`Twilio webhook: http://localhost:${PORT}/twilio`);
    console.log(`Media WS path: ws://localhost:${PORT}/media`);
});
