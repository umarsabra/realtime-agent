import { twilioClient } from "../config/client";
import Connection, { StartEventType } from "../core/Connection";
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
    private static END_EVENTS = ["stop", "error", "close"];
    private callSid?: string;
    private streamSid?: string;

    private readonly type = "twilio" as const;


    private listeners: Map<string, (data: any) => void> = new Map();





    private send(message: any) {
        const json = JSON.stringify(message);
        this.socket.send(json);
    }



    init() {
        this.on("message", (data) => {
            const raw = typeof data === "string" ? data : data.toString("utf8");
            const event = safeJsonParse<TwilioInboundEvent | any>(raw);
            if (!event) {
                console.warn("[twilio] received non-json message:", raw);
                return;
            }


            // execute default logic for important events like "start" to keep track of call and stream ids, which are needed for other operations like sending media and hanging up.
            if (event.event === "start") {
                this.onConnectionStartEvent(event);
            }


            if (TwilioConnection.END_EVENTS.includes(event.event)) {
                this.clean();
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





    private clean() {
        const callSid = this.getCallSid();
        if (callSid) {
            twilioClient.removeSession(callSid);
        }
    }

    private onConnectionStartEvent(event: any) {
        const callSid = event.start?.callSid;
        const streamSid = event.start?.streamSid;

        if (streamSid) this.setStreamSid(streamSid);
        if (callSid) this.setCallSid(callSid);

        twilioClient.addSession(callSid, { streamSid, callSid });
    }




    public onStart(listener: (e: StartEventType) => void) {
        this.registerListener("start", listener);
    }
    public onError(listener: (e: any) => void) {
        this.registerListener("error", listener);
    }

    public onClose(listener: (e: any) => void): void {
        this.registerListener("close", listener);
    }

    public onStop(listener: (e: any) => void) {
        this.registerListener("stop", listener);
    }



    public onMedia(listener: (audio: Buffer) => void) {
        this.registerListener("media", (event) => {
            const payload = event.media?.payload;
            listener(payload);
        });
    }









    public async hangup(reason?: string) {
        const callSid = this.getCallSid();
        if (!callSid) {
            console.warn("[twilio] cannot hangup call: missing callSid");
            return { status: "error" as const, message: "Missing callSid for hangup" };
        }
        await twilioClient.hangup(callSid, reason);
        return { status: "ok" as const, message: `Call ended: ${reason}` };
    }


    public sendAudio(buffer: Buffer) {
        this.send({
            streamSid: this.getStreamSid(),
            event: "media",
            media: { payload: buffer.toString("base64") },
        })
    }

    public clear() {
        this.send({ event: "clear", streamSid: this.getStreamSid() })
    }





    // getters
    public getStreamSid() {
        return this.streamSid;
    }
    public getCallSid() {
        return this.callSid;
    }


    // setters
    private setStreamSid(streamSid: string) {
        super.setId(streamSid);
        this.streamSid = streamSid;
    }

    private setCallSid(callSid: string) {
        super.setChannelId(callSid);
        this.callSid = callSid;
    }

}