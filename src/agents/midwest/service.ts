import { frappe } from ".";
import { ToolResult } from "../../core/Agent";
import { AppError } from "../../utils";



type Job = Record<string, unknown> & { name?: string };

type Update = {
    name?: string;
    job: string;
    owner: string;
    reference_doctype?: string;
    reference_name?: string;
    creation: string | Date;
    content: string;
}

type Account = {
    fullname: string;
    account_number: string;
    pin_code: string;
    job_title: string;
    phone_number: string;
}






export async function getAccountByPhoneNumber({ phone_number }: { phone_number: string }): Promise<ToolResult<Account>> {
    try {
        if (!phone_number) throw new AppError("Missing phone_number", "error", "MISSING_PHONE_NUMBER");
        const accounts = await frappe.getList<Account>("Midwest Account", {
            filters: [["phone_number", "=", phone_number]],
            fields: ["*"],
            limit_page_length: 1,
        });
        if (accounts.length === 0) {
            throw new AppError("No account found with the provided phone number", "error", "ACCOUNT_NOT_FOUND");
        }
        return { status: "ok", data: accounts[0] };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve account for phone_number: ${phone_number}`,
            code: e?.code ?? "GET_ACCOUNT_FAILED",
            details: e?.message ?? String(e),
        };
    }
}


export async function getAccountByAccountNumberAndPin({ account_number, pin_code: pin }: { account_number: string; pin_code: string }): Promise<ToolResult<Account>> {
    try {
        if (!account_number) throw new AppError("Missing account_number", "error", "MISSING_ACCOUNT_NUMBER");
        if (!pin) throw new AppError("Missing pin", "error", "MISSING_PIN");
        const account = await frappe.getDoc<Account>("Midwest Account", account_number);
        if (account.pin_code !== pin) {
            throw new AppError("Invalid PIN", "error", "INVALID_PIN");
        }
        return { status: "ok", data: account };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve account for account_number: ${account_number}`,
            code: e?.code ?? "GET_ACCOUNT_FAILED",
            details: e?.message ?? String(e),
        };
    }
}

export async function getJobDetails({ job_id: jobId }: { job_id: string }): Promise<ToolResult<Job>> {
    try {
        if (!jobId) throw new AppError("Missing job_id", "error", "MISSING_JOB_ID");
        const job = await frappe.getDoc<Job>("Job", jobId, ["*"]);
        return { status: "ok", data: job };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve job details for job_id: ${jobId}`,
            code: e?.code ?? "GET_JOB_DETAILS_FAILED",
            details: e?.message ?? String(e),
        };
    }
}


export async function getJobUpdates({ job_id: jobId, stage }: { job_id: string; stage?: string }): Promise<ToolResult<Update[]>> {
    try {
        if (!jobId) throw new AppError("Missing job_id", "error", "MISSING_JOB_ID");
        let filters: any[] = [["job", "=", jobId]];
        if (stage) {
            filters.push(["reference_doctype", "=", stage]);
        }
        const updates = await frappe.getList<Update>("Update", {
            filters,
            fields: ["*"],
            order_by: "creation asc",
            limit_page_length: 50,
        });
        return { status: "ok", data: updates };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve job updates for job_id: ${jobId}`,
            code: e?.code ?? "GET_JOB_UPDATES_FAILED",
            details: e?.message ?? String(e),
        };
    }
}

