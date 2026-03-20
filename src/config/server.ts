import "dotenv/config";
import http from "http";
import express, { Request, Response } from "express";
import { WebSocketServer, WebSocket } from "ws";
import twilio from "twilio";
import { OpenAIAgent } from "../core/OpenAIAgent";
import { getConnection } from ".";
import { buildExtensionAgent, onExtensionAgentStart } from "../agents";





const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
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
    const connection = getConnection(ws);

    if (!OPENAI_API_KEY) {
        connection.close(1011, "Missing OPENAI_API_KEY");
        return;
    }


    let closed = false;
    let hangupTimerId: NodeJS.Timeout | null = null;
    let agent: OpenAIAgent | null = null;

    const close = (reason?: string) => {
        if (closed) return;
        closed = true;
        if (hangupTimerId) {
            clearTimeout(hangupTimerId);
            hangupTimerId = null;
        }
        if (reason) console.log("[bridge] closing:", reason);
        connection.close();
        agent?.close();
    };


    const scheduleHangup = (reason?: string, delayMs = 2500) => {
        if (closed || hangupTimerId) return;
        hangupTimerId = setTimeout(() => {
            hangupTimerId = null;
            connection.hangup(reason ?? "agent end_call")
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

    const attachAgentListeners = (activeAgent: OpenAIAgent) => {
        activeAgent.onAudio((buffer) => {
            connection.sendAudio(buffer);
        });

        activeAgent.onAssistantStarted(() => {
            onExtensionAgentStart(connection, activeAgent);
        });

        activeAgent.onUserStartedSpeaking(() => {
            connection.clear();
        });

        activeAgent.onClose(() => close("[bridge] agent closed"));
        activeAgent.onError((err) => close(`[bridge] agent error: ${err instanceof Error ? err.message : String(err)}`));
    };

    const ensureAgent = () => {
        if (agent) return agent;
        const activeAgent = buildExtensionAgent(connection, scheduleHangup);
        attachAgentListeners(activeAgent);
        activeAgent.connect();
        agent = activeAgent;
        return agent;
    };





    // Save the Asterisk media connection ids once the websocket channel is fully started.
    connection.onStart((e) => {
        console.log("[bridge] connection started: ", e);
        ensureAgent();
    });


    // When we receive media, we stream it directly to Agent as it arrives for the most real-time experience.
    connection.onMedia((buffer) => {
        if (!agent?.ready) return;
        agent.sendAudio(buffer);
    });


    // Cleanup if either side closes
    connection.onClose(() => close("connection closed"));


    // When Asterisk closes the media websocket, clean up the OpenAI side as well.
    connection.onStop(() => close("connection stopped"));


    // Log and close on Asterisk WS errors
    connection.onError(() => close("connection error"));

});



export default server;
