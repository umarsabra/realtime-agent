import twilio from "twilio";


export interface TwilioClientConfig {
    accountSid: string;
    authToken: string;
}



export default class TwilioClient {
    private config: TwilioClientConfig;
    private client: ReturnType<typeof twilio>;
    private sessions: Map<string, any> = new Map();



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






    public addSession(callSid: string, sessionData: any) {
        this.sessions.set(callSid, sessionData);
    }

    public getSession<T>(callSid: string): T | undefined {
        return this.sessions.get(callSid);
    }

    public removeSession(callSid: string) {
        this.sessions.delete(callSid);
    }







    public async hangup(callSid: string, reason?: string) {
        await this.client.calls(callSid)
            .update({ status: "completed" });
        this.removeSession(callSid);
        return { status: "ok" as const, message: `Call ended: ${reason}` };
    }







    // getters
    public getClient() {
        return this.client;
    }

}

