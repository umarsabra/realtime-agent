import twilio from "twilio";
import Connection from "./Connection";
import { WebSocket } from "ws";
import { safeJsonParse } from "../utils";
import { TwilioInboundEvent } from "./types";

export interface TwilioCallServiceConfig {
    accountSid: string;
    authToken: string;
}

export class TwilioCallService {
    private client: ReturnType<typeof twilio>;

    constructor(private cfg: TwilioCallServiceConfig) {
        this.client = twilio(cfg.accountSid, cfg.authToken);
    }

    async endCall(callSid: string, reason: string) {
        await this.client.calls(callSid).update({ status: "completed" });
        return { status: "ok" as const, message: `Call ended: ${reason}` };
    }
}






export class TwilioConnection extends Connection {

    private registry: Map<string, (data: any) => void> = new Map();




    onStart(listener: (data: any) => void) {
        this.registerEvent("start", listener);
    }

    onMedia(listener: (data: any) => void) {
        this.registerEvent("media", (data) => listener(data.media?.payload));
    }

    onStop(listener: (data: any) => void) {
        this.registerEvent("stop", listener);
    }




    init() {
        this.on("message", (data) => {
            const raw = typeof data === "string" ? data : data.toString("utf8");
            const event = safeJsonParse<TwilioInboundEvent | any>(raw);
            if (!event) {
                console.warn("[twilio] received non-json message:", raw);
                return;
            }
            const listener = this.registry.has(event.event) ? this.registry.get(event.event) : null;
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

    private registerEvent(event: "start" | "media" | "stop" | string, listener: (data: any) => void) {
        this.registry.set(event, listener);
    }


    public onError(listener: (data: any) => void) {
        this.on("error", listener);
    }

    public onClose(listener: (data: any) => void): void {
        this.on("close", listener);
    }

    sendAudio(bytes: any) {
        this.send({
            streamSid: this.getId(),
            event: "media",
            media: { payload: bytes },
        })
    }

    clear() {
        this.send({ event: "clear", streamSid: this.getId() })
    }
}