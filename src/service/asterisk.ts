import Connection from "./Connection";
import ari from "ari-client";



export class AsteriskConnection extends Connection {

    private client: ari.Client | null = null;
    private initialized = false;
    private registry: Map<string, (data: any) => void> = new Map();




    private async connectAri() {
        const client = await ari.connect(
            "http://192.168.1.58:8088",
            "express",
            "supersecret"
        );

        client.on("StasisStart", async (event, channel) => {
            console.log("StasisStart:", channel.name, channel.id);

            // Ignore the external media websocket leg
            if (channel.name?.startsWith("WebSocket/")) {
                return;
            }

            // Optional: also ignore Local/ or other helper channels if you use them later
            // if (channel.name?.startsWith("Local/")) return;

            // Only now create bridge + external media
            const bridge = await client.bridges.create({ type: "mixing" });
            await bridge.addChannel({ channel: channel.id });

            const media = await client.channels.externalMedia({
                app: "realtime-ai-agent",
                external_host: "express",
                transport: "websocket",
                encapsulation: "none",
                format: "ulaw",
                direction: "both",
            });

            await bridge.addChannel({ channel: media.id });
        });

        client.start("realtime-ai-agent");
        this.client = client;
    }





    init() {
        if (this.initialized) return;

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
        this.connectAri();
        this.initialized = true;
    }





    public onStart(listener: (data: any) => void): void {
        this.registerEvent("start", listener);
    }
    public onError(listener: (data: any) => void): void {
        this.registerEvent("error", listener);
    }
    public onClose(listener: (data: any) => void): void {
        this.registerEvent("close", listener);
    }
    public onStop(listener: (data: any) => void): void {
        this.registerEvent("stop", listener);
    }
    public onMedia(listener: (data: Buffer) => void): void {
        this.registerEvent("media", listener);
    }
    private registerEvent(event: string, listener: (data: any) => void) {
        this.registry.set(event, listener);
    }






    // Send audio bytes directly to the socket
    sendAudio(bytes: Buffer): void {
        this.socket.send(bytes, { binary: true });
    }


} 