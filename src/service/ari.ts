import ari from "ari-client";

export async function connectAri() {
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
}
