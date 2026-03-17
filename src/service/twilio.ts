import { twilio } from "../config/client";
import Connection from "../core/Connection";
import { safeJsonParse } from "../utils";

export type TwilioInboundEvent =
    | { event: "start"; start?: { streamSid?: string; callSid?: string; mediaFormat?: unknown } }
    | { event: "media"; media?: { payload?: string } }
    | { event: "stop" }
    | { event: string;[k: string]: unknown };



export interface TwilioCallServiceConfig {
    accountSid: string;
    authToken: string;
}




export class TwilioConnection extends Connection {

    private listeners: Map<string, (data: any) => void> = new Map();




    public async hangup(reason?: string) {
        const callId = this.getChannelId();
        if (!callId) {
            console.warn("[twilio] cannot hangup call: missing callId");
            return { status: "error" as const, message: "Missing callId for hangup" };
        }
        const client = twilio.getClient();
        await client
            .calls(callId)
            .update({ status: "completed" });
        return { status: "ok" as const, message: `Call ended: ${reason}` };
    }


    init() {
        this.on("message", (data) => {
            const raw = typeof data === "string" ? data : data.toString("utf8");
            const event = safeJsonParse<TwilioInboundEvent | any>(raw);
            if (!event) {
                console.warn("[twilio] received non-json message:", raw);
                return;
            }


            if (event.event === "start") {
                const callId = event.start?.callSid;
                const streamSid = event.start?.streamSid;
                if (callId) this.setChannelId(callId);
                if (streamSid) this.setId(streamSid);
            }

            const listener = this.listeners.has(event.event) ? this.listeners.get(event.event) : null;
            if (listener) {
                try {
                    listener(event);
                } catch (e) {
                    console.warn("[twilio] received event with unserializable data");
                }
            } else {
                console.warn("[twilio] no listener for event:", event.event);
            }
        });
    }

    private registerListener(event: "start" | "media" | "stop" | string, listener: (data: any) => void) {
        this.listeners.set(event, listener);
    }






    public onStart(listener: (e: any) => void) {
        this.registerListener("start", listener);
    }
    public onError(listener: (e: any) => void) {
        this.registerListener("error", listener);
    }

    public onClose(listener: (e: any) => void): void {
        this.registerListener("close", listener);
    }

    public onMedia(listener: (audio: Buffer) => void) {
        this.registerListener("media", (event) => {
            const payload = event.media?.payload;
            listener(payload);
        });
    }

    public onStop(listener: (e: any) => void) {
        this.registerListener("stop", listener);
    }







    private send(message: any) {
        const json = JSON.stringify(message);
        this.socket.send(json);
    }


    public sendAudio(buffer: Buffer) {
        this.send({
            streamSid: this.getId(),
            event: "media",
            media: { payload: buffer.toString("base64") },
        })
    }

    clear() {
        this.send({ event: "clear", streamSid: this.getId() })
    }
}