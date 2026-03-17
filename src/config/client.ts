import ARIClient from "../utils/ARIClient"
import TwilioClient from "../utils/TwilioClient"



const URL: string = "http://192.168.1.58:8088"
const USERNAME: string = "express"
const HOST: string = "express"
const APP: string = "realtime-ai-agent"
const PASSWORD: string = "supersecret"




export const ari = ARIClient.getInstance({ url: URL, host: HOST, app: APP, username: USERNAME, password: PASSWORD });

export const twilio = TwilioClient.getInstance({
    accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
    authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
});
