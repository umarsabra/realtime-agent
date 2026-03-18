import "dotenv/config";
import AsteriskClient from "../core/AsteriskClient"
import TwilioClient from "../core/TwilioClient"



const URL: string = "http://192.168.1.58:8088"
const USERNAME: string = "express"
const HOST: string = "express"
const APP: string = "realtime-ai-agent"
const PASSWORD: string = "supersecret"
const CONNECTION_TYPE = process.env.CONNECTION_TYPE ?? "ws";



let asteriskClient: AsteriskClient | null = null;
if (CONNECTION_TYPE === "asterisk") {
    asteriskClient = AsteriskClient.getInstance({ url: URL, host: HOST, app: APP, username: USERNAME, password: PASSWORD });
}

const twilioClient = TwilioClient.getInstance({
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
});



export { asteriskClient, twilioClient }

