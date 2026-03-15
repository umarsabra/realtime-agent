import ari from "ari-client";


const URL: string = "http://192.168.1.58:8088"
const USERNAME: string = "express"
const HOST: string = "express"
const APP: string = "realtime-ai-agent"
const PASSWORD: string = "supersecret"

type CallSession = {
    caller: ari.Channel;
    bridge: ari.Bridge;
    media: ari.Channel;
};

let clientRef: ari.Client | null = null;
const sessions = new Map<string, CallSession>();
const callerIdByMediaId = new Map<string, string>();

function resolveCallerId(channelId: string) {
    if (sessions.has(channelId)) return channelId;
    return callerIdByMediaId.get(channelId) ?? null;
}

async function cleanupSession(channelId: string, reason: string) {
    const callerId = resolveCallerId(channelId);
    if (!callerId) return;

    const session = sessions.get(callerId);
    if (!session) return;

    sessions.delete(callerId);
    callerIdByMediaId.delete(session.media.id);
    console.log(`[ari] cleaning session ${callerId}: ${reason}`);

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
}

export async function hangupCall(channelId: string) {
    const callerId = resolveCallerId(channelId) ?? channelId;
    const session = sessions.get(callerId);

    if (session) {
        console.log(`[ari] hanging up caller channel ${callerId}`);
        await session.caller.hangup();
        return;
    }

    if (!clientRef) {
        throw new Error("ARI client is not connected");
    }

    console.log(`[ari] hanging up channel ${callerId} via client`);
    await clientRef.channels.hangup({ channelId: callerId });
}

export default async function connectAri() {
    const client = await ari.connect(
        URL,
        USERNAME,
        PASSWORD
    );
    clientRef = client;

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
        sessions.set(channel.id, { caller: channel, bridge, media });
        callerIdByMediaId.set(media.id, channel.id);
    });

    client.on("StasisEnd", async (_event, channel) => {
        await cleanupSession(channel.id, "caller left stasis");
    });

    client.on("ChannelDestroyed", async (_event, channel) => {
        await cleanupSession(channel.id, "caller channel destroyed");
    });

    client.start(APP);
}
