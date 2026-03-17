import Connection from "../core/Connection";
import { WebSocket } from "ws";
import { safeJsonParse } from "../utils";
import { ari } from "../config/client";



type ListenerCallback = (args?: any) => void;
type AsteriskControlEvent = {
    event: string;
    connection_id?: string;
    channel_id?: string;
    channel?: string;
    [key: string]: unknown;
};
type ListenerType = "close" | "error" | "open" | "message";




export class AsteriskConnection extends Connection {
    private initialized = false;
    private listeners = new Map<string, ListenerCallback[]>();



    public on(eventType: ListenerType, callback: ListenerCallback) {
        this.registerListener(eventType, callback);
    }
    private executeListener(eventType: string, args?: any) {
        const listeners = this.listeners.get(eventType) ?? [];
        listeners.forEach((callback) => {
            try {
                callback(args)
            } catch (err) {
                console.error(`[listener error] eventType: ${eventType} callback threw an error:`, err);
            }
        });
    }
    private registerListener(eventType: string, callback: ListenerCallback) {
        const existing = this.listeners.get(eventType) ?? [];
        this.listeners.set(eventType, [...existing, callback]);
    }








    private onMessage(data: any, isBinary: boolean) {
        // if message is binary, it's audio data from the external media channel
        if (isBinary) {
            const audio = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
            this.executeListener("audio", audio);
            return;
        }

        const raw = Buffer.isBuffer(data) ? data.toString("utf8") : data.toString();
        const event = this.parseControlMessage(raw);
        if (!event) {
            console.warn("[asterisk] received unknown control message:", raw);
            return;
        }

        if (event.event === "MEDIA_START") {
            if (typeof event.connection_id === "string") {
                this.setId(event.connection_id);
            }
            if (typeof event.channel_id === "string") {
                this.setChannelId(ari.getChannelIdByChannelId(event.channel_id) ?? event.channel_id);
            }

            const e = {
                connectionId: event.connection_id,
                channelId: this.getChannelId(),
            };
            this.executeListener("start", e);
            return;
        }

        this.executeListener("message", event);
    }



    init() {
        console.log("[asterisk] New Asterisk WebSocket connection established.");
        if (this.initialized) return;

        this.socket.on("message", (data, isBinary) => {
            this.onMessage(data, isBinary);
        });

        this.socket.on("close", (code, reason) => {
            const payload = {
                code,
                reason: reason.toString("utf8"),
            };
            this.executeListener("stop", payload);
            this.executeListener("close", payload);
        });

        this.socket.on("error", (err) => {
            this.executeListener("error", err);
        });

        this.initialized = true;
    }





    public onStart(listener: (data: any) => void): void {
        this.registerListener("start", listener);
    }
    public onError(listener: (data: any) => void): void {
        this.registerListener("error", listener);
    }
    public onClose(listener: (data: any) => void): void {
        this.registerListener("close", listener);
    }
    public onStop(listener: (data: any) => void): void {
        this.registerListener("stop", listener);
    }
    public onMedia(listener: (data: Buffer) => void): void {
        this.registerListener("audio", listener);
    }



    // Send audio bytes directly to the socket
    public sendAudio(bytes: Buffer): void {
        this.socket.send(bytes, { binary: true });
    }

    public clear(): void {
        if (this.socket.readyState !== WebSocket.OPEN) return;
        this.socket.send("FLUSH_MEDIA");
    }



    public async hangup(reason?: string): Promise<void> {
        const channelId = this.getChannelId();
        if (!channelId) {
            console.warn("[asterisk] cannot hangup call: no channel id associated with connection");
            return;
        }

        const session = ari.getSessionByChannelId(channelId);
        if (session) {
            console.log(`[asterisk] hanging up caller channel ${channelId} via session`);
            await session.channel.hangup();
            return;
        }

        console.log(`[asterisk] hanging up channel ${this.getChannelId()} via client`);
        await ari.getClient()?.channels.hangup({ channelId });
    }


    public close(code?: number, reason?: any): void {
        if (
            this.socket.readyState !== WebSocket.OPEN &&
            this.socket.readyState !== WebSocket.CONNECTING
        ) {
            return;
        }

        if (this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send("HANGUP");
            } catch (err) {
                console.warn("[asterisk] failed to send HANGUP before closing:", err);
            }
        }

        this.socket.close(code, reason);
    }

    private parseControlMessage(raw: string): AsteriskControlEvent | null {
        const json = safeJsonParse<Record<string, unknown>>(raw);
        if (json && typeof json === "object") {
            const eventName =
                typeof json.event === "string"
                    ? json.event
                    : typeof json.type === "string"
                        ? json.type
                        : null;

            if (!eventName) return null;

            return {
                ...json,
                event: eventName,
            } as AsteriskControlEvent;
        }

        const [event, ...parts] = raw.trim().split(/\s+/);
        if (!event) return null;

        const parsed: AsteriskControlEvent = { event };
        for (const part of parts) {
            const separatorIndex = part.indexOf(":");
            if (separatorIndex <= 0) continue;

            const key = part.slice(0, separatorIndex);
            const value = part.slice(separatorIndex + 1);
            parsed[key] = value;
        }

        return parsed;
    }

}
