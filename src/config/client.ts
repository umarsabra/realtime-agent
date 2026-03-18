import "dotenv/config";
import ARIClient from "../utils/ARIClient"
import TwilioClient from "../utils/TwilioClient"



const URL: string = "http://192.168.1.58:8088"
const USERNAME: string = "express"
const HOST: string = "express"
const APP: string = "realtime-ai-agent"
const PASSWORD: string = "supersecret"
const CONNECTION_TYPE = process.env.CONNECTION_TYPE ?? "ws";



let ari: ARIClient | null = null;
if (CONNECTION_TYPE === "asterisk") {
    ari = ARIClient.getInstance({ url: URL, host: HOST, app: APP, username: USERNAME, password: PASSWORD });
}



export { ari }

export const twilio = TwilioClient.getInstance({
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
});
