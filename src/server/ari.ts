import ari from "ari-client";


const URL: string = "http://192.168.1.58:8088"
const USERNAME: string = "express"
const HOST: string = "express"
const APP: string = "realtime-ai-agent"
const PASSWORD: string = "supersecret"

type CallSession = {
    bridge: ari.Bridge;
    media: ari.Channel;
};

export default async function connectAri() {
    const client = await ari.connect(
        URL,
        USERNAME,
        PASSWORD
    );
    const sessions = new Map<string, CallSession>();

    const cleanupSession = async (channelId: string, reason: string) => {
        const session = sessions.get(channelId);
        if (!session) return;

        sessions.delete(channelId);
        console.log(`[ari] cleaning session ${channelId}: ${reason}`);

        try {
            await session.media.hangup();
        } catch (err) {
            console.warn(`[ari] failed to hang up external media channel ${session.media.id}:`, err);
        }

        try {
            await session.bridge.destroy();
        } catch (err) {
            console.warn(`[ari] failed to destroy bridge ${session.bridge.id}:`, err);
        }
    };

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
            app: APP,
            external_host: HOST,
            transport: "websocket",
            encapsulation: "none",
            format: "ulaw",
            direction: "both",
        });

        await bridge.addChannel({ channel: media.id });
        sessions.set(channel.id, { bridge, media });
    });

    client.on("StasisEnd", async (_event, channel) => {
        if (channel.name?.startsWith("WebSocket/")) {
            return;
        }
        await cleanupSession(channel.id, "caller left stasis");
    });

    client.on("ChannelDestroyed", async (_event, channel) => {
        if (channel.name?.startsWith("WebSocket/")) {
            return;
        }

        await cleanupSession(channel.id, "caller channel destroyed");
    });

    client.start(APP);
}
