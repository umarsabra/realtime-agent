import twilio from "twilio";


export interface TwilioClientConfig {
    accountSid: string;
    authToken: string;
}


export default class TwilioClient {
    private client: ReturnType<typeof twilio>;
    private config: TwilioClientConfig;
    private static instance: TwilioClient | null = null;



    public static getInstance(config: TwilioClientConfig): TwilioClient {
        if (!TwilioClient.instance) {
            TwilioClient.instance = new TwilioClient(config);
        }
        return TwilioClient.instance;
    }
    private constructor(config: TwilioClientConfig) {
        this.config = config;
        this.client = twilio(config.accountSid, config.authToken);
    }






    public getClient() {
        return this.client;
    }

    public async hangup(callSid: string, reason?: string) {
        await this.client.calls(callSid).update({ status: "completed" });
        return { status: "ok" as const, message: `Call ended: ${reason}` };
    }
}

