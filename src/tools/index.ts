import "dotenv/config";
import { FrappeClient } from "../utils/FrappeClient";
import { TwilioCallService } from "../service/twilio";
import { createJobTools } from "../service/frappe";

const FRAPPE_API_KEY = process.env.FRAPPE_API_KEY ?? "";
const FRAPPE_API_SECRET = process.env.FRAPPE_API_SECRET ?? "";
const FRAPPE_BASE_URL = process.env.FRAPPE_BASE_URL ?? "https://app.midwestsolutions.com";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";

const frappe = new FrappeClient({
    baseUrl: FRAPPE_BASE_URL,
    apiKey: FRAPPE_API_KEY,
    apiSecret: FRAPPE_API_SECRET,
    timeoutMs: 10_000,
    retries: 1,
});

const twilioClient =
    TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
        ? new TwilioCallService({ accountSid: TWILIO_ACCOUNT_SID, authToken: TWILIO_AUTH_TOKEN })
        : undefined;



const jobTools = createJobTools({ frappe, twilio: twilioClient });
export const getJobDetails = jobTools.getJobDetails;
export const getJobUpdates = jobTools.getJobUpdates;
export const endCall = jobTools.endCall;