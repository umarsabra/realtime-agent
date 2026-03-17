import ari from "ari-client";




interface ARIClientConfig {
    url: string;
    host: string;
    app: string;
    username: string;
    password: string;
}



type CallSession = {
    channel: ari.Channel;
    bridge: ari.Bridge;
    mediaChannelId: string;
    media: ari.Channel | null;
};



export default class ARIClient {
    private static readonly MEDIA_CHANNEL_PREFIX = "media:";
    private client: ari.Client | null = null;
    private config: ARIClientConfig;
    private sessions = new Map<string, CallSession>();
    private callerIdByMediaId = new Map<string, string>();
    private listeners = new Map<string, ((...args: any[]) => void)[]>();


    private static instance: ARIClient;



    public static getInstance(config: ARIClientConfig) {
        if (this.instance) return this.instance;
        this.instance = new ARIClient(config)
        return this.instance;
    }


    private constructor(config: ARIClientConfig) {
        this.config = config;
        this.connect()
            .then((c) => {
                this.setClient(c);
                this.init();
            })
            .catch((e) => {
                console.error("Couldn't connect to asterisk:", e);
            })
    }




    private async connect() {
        return await ari.connect(
            this.config.url,
            this.config.username,
            this.config.password
        );
    }

    private setClient(client: ari.Client) {
        this.client = client;
    }

    private init() {
        if (!this.client) return;

        this.client.on("StasisStart", async (event, channel) => {

            if (!this.client) return;
            console.log("StasisStart:", channel.name, channel.id);

            const callerId = this.getCallerIdFromMediaChannelId(channel.id);
            if (callerId) {
                await this.attachMediaChannel(callerId, channel);
                return;
            }

            if (this.isExternalMediaChannel(channel)) {
                console.warn(`[ari] ignoring unmanaged external media channel ${channel.id}`);
                return;
            }

            await this.setupSession(channel);
        });


        this.client.on("StasisEnd", async (_event, channel) => {
            console.log(`[ari] StasisEnd: ${channel.name} ${channel.id}`);
            await this.cleanupSession(channel.id, "caller left stasis");
        });


        this.client.on("ChannelDestroyed", async (event, channel) => {
            console.log(
                `[ari] ChannelDestroyed: ${channel.name} ${channel.id} cause=${event.cause} cause_txt=${event.cause_txt}`
            );
            await this.cleanupSession(channel.id, "caller channel destroyed");
        });


        this.client.start(this.config.app).then(() => {
            console.log("ARI client started");
        }).catch((err) => {
            console.error("Failed to start ARI client:", err);
        });
    }

    private async setupSession(channel: ari.Channel) {
        if (!this.client) return;

        const callerId = channel.id;
        const mediaChannelId = `${ARIClient.MEDIA_CHANNEL_PREFIX}${callerId}`;
        let step = "answer inbound channel";
        let bridge: ari.Bridge | null = null;
        let media: ari.Channel | null = null;

        try {
            if (this.sessions.has(callerId)) {
                console.warn(`[ari] session for caller ${callerId} already exists`);
                return;
            }

            if (channel.state !== "Up") {
                await channel.answer();
            }

            step = "create mixing bridge";
            bridge = await this.client.bridges.create({ type: "mixing" });

            step = `add caller channel ${callerId} to bridge ${bridge.id}`;
            await bridge.addChannel({ channel: callerId });

            this.sessions.set(callerId, {
                channel,
                bridge,
                mediaChannelId,
                media: null,
            });

            step = `create external media channel ${mediaChannelId}`;
            media = await this.client.channels.externalMedia({
                app: this.config.app,
                channelId: mediaChannelId,
                external_host: this.config.host,
                transport: "websocket",
                encapsulation: "none",
                format: "ulaw",
                direction: "both",
            });

            const session = this.sessions.get(callerId);
            if (session) {
                session.media = media;
            }

            console.log(`[ari] requested external media caller=${callerId} media=${media.id} bridge=${bridge.id}`);
        } catch (err) {
            console.error(`[ari] failed to set up session for ${callerId} during "${step}":`, err);

            this.sessions.delete(callerId);
            this.callerIdByMediaId.delete(mediaChannelId);

            if (media) {
                try {
                    await media.hangup();
                } catch (cleanupErr) {
                    if (!this.isAriMessage(cleanupErr, "Channel not found")) {
                        console.warn(`[ari] failed to hang up partial media channel ${media.id}:`, cleanupErr);
                    }
                }
            }

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

    private async attachMediaChannel(callerId: string, mediaChannel: ari.Channel) {
        const session = this.sessions.get(callerId);
        if (!session) {
            console.warn(`[ari] received media channel ${mediaChannel.id} for unknown caller ${callerId}`);
            return;
        }

        if (session.media?.id === mediaChannel.id && this.callerIdByMediaId.has(mediaChannel.id)) {
            return;
        }

        session.media = mediaChannel;
        this.callerIdByMediaId.set(mediaChannel.id, callerId);

        try {
            await session.bridge.addChannel({ channel: mediaChannel.id });
            console.log(`[ari] session ready caller=${callerId} media=${mediaChannel.id} bridge=${session.bridge.id}`);
        } catch (err) {
            console.error(
                `[ari] failed to attach external media channel ${mediaChannel.id} to bridge ${session.bridge.id}:`,
                err
            );
            await this.cleanupSession(mediaChannel.id, "failed to attach external media channel to bridge");
        }
    }




    private async cleanupSession(channelId: string, reason: string) {
        const callerId = this.resolveCallerId(channelId);
        if (!callerId) return;

        const session = this.sessions.get(callerId);
        if (!session) return;

        this.sessions.delete(callerId);
        this.callerIdByMediaId.delete(session.media?.id ?? session.mediaChannelId);

        console.log(`[ari] cleaning session ${callerId}: ${reason}`);

        try {
            if (session.media) {
                await session.media.hangup();
            } else if (this.client) {
                await this.client.channels.hangup({ channelId: session.mediaChannelId });
            }
        } catch (err) {
            if (!this.isAriMessage(err, "Channel not found")) {
                console.warn(
                    `[ari] failed to hang up external media channel ${session.media?.id ?? session.mediaChannelId}:`,
                    err
                );
            }
        }

        try {
            await session.bridge.destroy();
        } catch (err) {
            if (!this.isAriMessage(err, "Bridge not found")) {
                console.warn(`[ari] failed to destroy bridge ${session.bridge.id}:`, err);
            }
        }
    }

    private resolveCallerId(channelId: string) {
        if (this.sessions.has(channelId)) return channelId;
        return this.callerIdByMediaId.get(channelId) ?? this.getCallerIdFromMediaChannelId(channelId);
    }

    private isAriMessage(err: unknown, message: string) {
        return err instanceof Error && err.message.includes(message);
    }

    private isExternalMediaChannel(channel: ari.Channel) {
        return Boolean(
            channel.name?.startsWith("WebSocket/") ||
            this.getCallerIdFromMediaChannelId(channel.id)
        );
    }

    private getCallerIdFromMediaChannelId(channelId?: string | null) {
        if (!channelId?.startsWith(ARIClient.MEDIA_CHANNEL_PREFIX)) return null;
        return channelId.slice(ARIClient.MEDIA_CHANNEL_PREFIX.length) || null;
    }



    public async hangupCallByCallerId(callerId: string) {
        const session = this.getSessionByCallerId(callerId);
        if (!session) {
            console.log(`[asterisk] couldn't find session for callerId ${callerId} to hangup`);
            return;
        }
        await session.channel.hangup();
    }

    public getSessionByCallerId(callerId?: string | null): CallSession | null {
        if (!callerId) return null;
        return this.sessions.get(callerId) ?? null;
    }

    public getCallerIdByChannelId(channelId?: string | null) {
        if (!channelId) return null;
        return this.resolveCallerId(channelId);
    }

    public getClient() {
        return this.client;
    }

}
