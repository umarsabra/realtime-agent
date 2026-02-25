import twilio from "twilio";

export interface TwilioCallServiceConfig {
    accountSid: string;
    authToken: string;
}

export class TwilioCallService {
    private client: ReturnType<typeof twilio>;

    constructor(private cfg: TwilioCallServiceConfig) {
        this.client = twilio(cfg.accountSid, cfg.authToken);
    }

    async endCall(callSid: string, reason: string) {
        await this.client.calls(callSid).update({ status: "completed" });
        return { status: "ok" as const, message: `Call ended: ${reason}` };
    }
}