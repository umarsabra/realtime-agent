import ari from "ari-client";




interface ARIClientConfig {
    url: string;
    host: string;
    app: string;
    username: string;
    password: string;
}



type CallSession = {
    callChannelId: string;
    mediaChannelId: string;
    callChannel: ari.Channel;
    bridge: ari.Bridge;
    mediaChannel: ari.Channel | null;
};



export default class AsteriskClient {
    private config: ARIClientConfig;
    private client: ari.Client | null = null;
    private static readonly MEDIA_CHANNEL_PREFIX = "media:";
    private sessionsByCallChannelId = new Map<string, CallSession>();
    private sessionsByMediaChannelId = new Map<string, CallSession>();





    private static instance: AsteriskClient;
    public static getInstance(config: ARIClientConfig) {
        if (this.instance) return this.instance;
        this.instance = new AsteriskClient(config)
        return this.instance;
    }
    private constructor(config: ARIClientConfig) {
        this.config = config;
        this.connect()
            .then((c) => {
                this.client = c;
                this.init();
            })
            .catch((e) => {
                console.error("Couldn't connect to asterisk:", e);
            })
    }






    private init() {
        if (!this.client) return;

        this.client.on("StasisStart", async (event, channel) => {
            if (!this.client) return;
            console.log("StasisStart:", channel.name, channel.id);

            const session = this.getSessionForChannel(channel.id);
            if (session && channel.id === session.mediaChannelId) {
                console.log(`[ari] external media channel ${channel.id} started, attaching to session call=${session.callChannelId}`);
                await this.attachMediaChannel(session, channel);
                return;
            }

            if (this.isExternalMediaChannel(channel)) {
                console.warn(`[ari] ignoring unmanaged external media channel ${channel.id}`);
                return;
            }

            await this.createCallSession(channel);
        });


        this.client.on("StasisEnd", async (_event, channel) => {
            console.log(`[ari] StasisEnd: ${channel.name} ${channel.id}`);
            await this.cleanupSession(channel.id, "channel left stasis");
        });


        this.client.on("ChannelDestroyed", async (event, channel) => {
            console.log(
                `[ari] ChannelDestroyed: ${channel.name} ${channel.id} cause=${event.cause} cause_txt=${event.cause_txt}`
            );
            await this.cleanupSession(channel.id, "channel destroyed");
        });


        this.client.start(this.config.app)
            .then(() => {
                console.log("ARI client started");
            }).catch((err) => {
                console.error("Failed to start ARI client:", err);
            });
    }



    private async connect() {
        return await ari.connect(
            this.config.url,
            this.config.username,
            this.config.password
        );
    }




    private async createCallSession(callChannel: ari.Channel) {
        if (!this.client) return;

        const callChannelId = callChannel.id;
        const mediaChannelId = this.buildMediaChannelId(callChannelId);


        let step = "answer inbound channel";
        let bridge: ari.Bridge | null = null;
        let session: CallSession | null = null;

        try {
            if (this.sessionsByCallChannelId.has(callChannelId)) {
                console.warn(`[ari] session for channel ${callChannelId} already exists`);
                return;
            }

            if (callChannel.state !== "Up") {
                await callChannel.answer();
            }

            step = "create mixing bridge";
            bridge = await this.client.bridges.create({ type: "mixing" });

            step = `add call channel ${callChannelId} to bridge ${bridge.id}`;
            await bridge.addChannel({ channel: callChannelId });

            session = {
                callChannelId,
                mediaChannelId,
                callChannel,
                bridge,
                mediaChannel: null,
            };
            this.addSession(session);

            step = `create external media channel ${mediaChannelId}`;
            await this.client.channels.externalMedia({
                app: this.config.app,
                channelId: mediaChannelId,
                external_host: this.config.host,
                transport: "websocket",
                encapsulation: "none",
                format: "ulaw",
                direction: "both",
            });

            console.log(`[ari] requested external media channel call=${callChannelId} media=${mediaChannelId} bridge=${bridge.id}`);
        } catch (err) {
            console.error(`[ari] failed to set up session for ${callChannelId} during "${step}":`, err);
            if (session) {
                this.removeSession(session);
            }
            await this.hangupMediaChannel(mediaChannelId);
            if (bridge) {
                try {
                    await bridge.destroy();
                } catch (cleanupErr) {
                    if (!this.isAriMessage(cleanupErr, "Bridge not found")) {
                        console.warn(`[ari] failed to destroy partial bridge ${bridge.id}:`, cleanupErr);
                    }
                }
            }
        }
    }





    private async attachMediaChannel(session: CallSession, mediaChannel: ari.Channel) {
        if (session.mediaChannel?.id === mediaChannel.id) return;
        try {
            await session.bridge.addChannel({ channel: mediaChannel.id });
            session.mediaChannel = mediaChannel;
            console.log(`[ari] session ready call=${session.callChannelId} media=${mediaChannel.id} bridge=${session.bridge.id}`);
        } catch (err) {
            console.error(`[ari] failed to attach external media channel ${mediaChannel.id} to bridge ${session.bridge.id}:`, err);
            await this.cleanupSession(session.mediaChannelId, "failed to attach external media channel to bridge");
        }
    }






    private async cleanupSession(channelId: string, reason: string) {
        const session = this.getSessionForChannel(channelId);
        if (!session) return;

        this.removeSession(session);

        console.log(`[ari] cleaning session ${session.callChannelId}: ${reason}`);

        await this.hangupMediaChannel(session.mediaChannelId, session.mediaChannel);

        try {
            await session.bridge.destroy();
        } catch (err) {
            if (!this.isAriMessage(err, "Bridge not found")) {
                console.warn(`[ari] failed to destroy bridge ${session.bridge.id}:`, err);
            }
        }
    }





    private isAriMessage(err: unknown, message: string) {
        return err instanceof Error && err.message.includes(message);
    }

    private isExternalMediaChannel(channel: ari.Channel) {
        return Boolean(channel.name?.startsWith("WebSocket/"));
    }

    private buildMediaChannelId(callChannelId: string) {
        return `${AsteriskClient.MEDIA_CHANNEL_PREFIX}${callChannelId}`;
    }

    private addSession(session: CallSession) {
        this.sessionsByCallChannelId.set(session.callChannelId, session);
        this.sessionsByMediaChannelId.set(session.mediaChannelId, session);
    }

    private removeSession(session: CallSession) {
        this.sessionsByCallChannelId.delete(session.callChannelId);
        this.sessionsByMediaChannelId.delete(session.mediaChannelId);
    }




    /**
     * Hangs up the media channel associated with the given media channel id, if it exists.
     * @param mediaChannelId the media channel id associated with the session to hang up
     * @param mediaChannel  the media channel object to hang up, if already available (optional optimization to avoid fetching the channel again if we already have it)
     * @returns a promise that resolves when the hangup request is complete
     */
    private async hangupMediaChannel(mediaChannelId: string, mediaChannel?: ari.Channel | null) {
        try {
            if (mediaChannel) {
                await mediaChannel.hangup();
                return;
            }
            if (this.client) {
                await this.client.channels.hangup({ channelId: mediaChannelId });
            }
        } catch (err) {
            if (!this.isAriMessage(err, "Channel not found")) {
                console.warn(
                    `[ari] failed to hang up external media channel ${mediaChannel?.id ?? mediaChannelId}:`,
                    err
                );
            }
        }
    }



    /**
     * 
     * Hangs up the call associated with the given channel id, if it exists.
     * Used to ensure calls are cleaned up when sessions are removed due to unexpected channel destruction or stasis end events.
     * @param channelId the call or media channel id associated with the session to hang up
     * @returns a promise that resolves when the hangup request is complete
     */
    public async hangupCallByChannelId(channelId: string) {
        const session = this.getSessionForChannel(channelId);
        if (!session) {
            console.log(`[asterisk] couldn't find session for channelId ${channelId} to hangup`);
            return;
        }
        await session.callChannel.hangup();
    }



    /**
     * Finds the session associated with the given channel id, if it exists.
     * Used by AsteriskConnection instances to route hangup requests to the correct call channel,
     * since media channels are bridged but not mixed and thus don't receive events for the call channel.
     * @param channelId the call or media channel id associated with the session
     * @returns the session associated with the given channel id, or null if not found
     */
    public getSessionForChannel(channelId?: string | null): CallSession | null {
        if (!channelId) return null;
        // First check if the channel id belongs to a call channel, then check if it belongs to a media channel.
        return this.sessionsByCallChannelId.get(channelId)
            ?? this.sessionsByMediaChannelId.get(channelId)
            ?? null;
    }

    public getClient() {
        return this.client;
    }

}
