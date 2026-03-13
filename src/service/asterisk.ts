import { WebSocket } from "ws";
import Connection from "./Connection";


export class AsteriskConnection extends Connection {
    private registry: Map<string, (data: any) => void> = new Map();



    private registerEvent(event: string, listener: (data: any) => void) {
        this.registry.set(event, listener);
    }




    init() {
        this.socket.on("message", (data, isBinary) => {
            if (isBinary) {
                const audio = Buffer.isBuffer(data) ? data : Buffer.from(data as any);
                const listener = this.registry.has("media") ? this.registry.get("media") : null;
                if (listener) listener(audio);
            }
        });


        this.socket.on("close", (data) => {
            const listener = this.registry.has("close") ? this.registry.get("close") : null;
            if (listener) listener(data);
        });



        this.socket.on("error", (data) => {
            const listener = this.registry.has("error") ? this.registry.get("error") : null;
            if (listener) listener(data);
        });
    }



    onStart(listener: (data: any) => void): void {
        this.registerEvent("start", listener);
    }
    onError(listener: (data: any) => void): void {
        this.registerEvent("error", listener);
    }
    onClose(listener: (data: any) => void): void {
        this.registerEvent("close", listener);
    }
    onStop(listener: (data: any) => void): void {
        this.registerEvent("stop", listener);
    }
    onMedia(listener: (data: Buffer) => void): void {
        this.registerEvent("media", listener);
    }









    // Send audio bytes directly to the socket
    sendMedia(bytes: Buffer): void {
        this.socket.send(bytes, { binary: true });
    }

} 