import twilio from "twilio";
import Connection from "./Connection";
import { WebSocket } from "ws";

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






export class TwilioConnection implements Connection {
    public id: string | null | undefined;
    public websocket: WebSocket;

    constructor(websocket: WebSocket, id?: string | null) {
        this.id = id;
        this.websocket = websocket;
    }

    setId(id: string) {
        this.id = id
    }

    get ready() {
        return this.websocket.readyState === WebSocket.OPEN && typeof this.id == "string";
    }

    on(event: "message" | "close" | "error", listener: (data: any) => void) {
        this.websocket.on(event, listener);
    }

    close(code?: number, reason?: any) {
        this.websocket.close(code, reason);
    }

    send(message: Record<string, any>) {
        this.websocket.send(JSON.stringify(message));
    }

    stream(bytes: any) {
        this.send({
            streamSid: this.id,
            event: "media",
            media: { payload: bytes },
        })
    }

    clear() {
        this.send({ event: "clear", streamSid: this.id })
    }
}