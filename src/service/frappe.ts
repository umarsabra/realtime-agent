import { AppError } from "../utils/error";
import { FrappeClient } from "../utils/FrappeClient";
import type { Job, Update } from "./types";
import type { ToolResult } from "../tools/types";
import { TwilioCallService } from "./twilio";


export interface ToolDeps {
    frappe: FrappeClient;
    twilio?: TwilioCallService; // optional in dev
}

export function createJobTools(deps: ToolDeps) {

    return {
        async getJobDetails(jobId: string): Promise<ToolResult<Job>> {
            try {
                if (!jobId) throw new AppError("Missing job_id", "error", "MISSING_JOB_ID");
                const job = await deps.frappe.getDoc<Job>("Job", jobId, ["*"]);
                return { status: "ok", data: job };
            } catch (e: any) {
                return {
                    status: "error",
                    message: `Failed to retrieve job details for job_id: ${jobId}`,
                    code: e?.code ?? "GET_JOB_DETAILS_FAILED",
                    details: e?.message ?? String(e),
                };
            }
        },




        async getJobUpdates(jobId: string): Promise<ToolResult<Update[]>> {
            try {
                if (!jobId) throw new AppError("Missing job_id", "error", "MISSING_JOB_ID");
                const updates = await deps.frappe.list<Update>("Update", {
                    filter: ["job", "=", jobId],
                    fields: ["*"],
                    order_by: "modified desc",
                    limit_page_length: 50,
                });
                console.log(`Retrieved ${updates.length} updates for job_id: ${jobId}`, updates);
                return { status: "ok", data: updates };
            } catch (e: any) {
                return {
                    status: "error",
                    message: `Failed to retrieve job updates for job_id: ${jobId}`,
                    code: e?.code ?? "GET_JOB_UPDATES_FAILED",
                    details: e?.message ?? String(e),
                };
            }
        },





        async endCall(callSid: string | null | undefined, reason: string) {
            try {
                if (!callSid) throw new AppError("Missing callSid", "error", "MISSING_CALL_SID");
                if (!deps.twilio) throw new AppError("Missing Twilio client", "error", "MISSING_TWILIO_CLIENT");

                const res = await deps.twilio.endCall(callSid, reason);
                return res;
            } catch (e: any) {
                return {
                    status: "error",
                    message: e?.message ?? "Failed to end call",
                    code: e?.code ?? "END_CALL_FAILED",
                    details: e?.details ?? e?.message ?? String(e),
                };
            }
        },
    };
}