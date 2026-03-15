import { FrappeClient } from "../utils/FrappeClient";
import { TwilioCallService } from "./twilio";


export interface ToolDeps {
    frappe: FrappeClient;
    twilio?: TwilioCallService; // optional in dev
}


