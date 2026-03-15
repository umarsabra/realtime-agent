import { AppError } from "../utils/error";
import { FrappeClient } from "../utils/FrappeClient";
import type { Job, Update } from "./types";
import type { ToolResult } from "../tools/types";
import { TwilioCallService } from "./twilio";


export interface ToolDeps {
    frappe: FrappeClient;
    twilio?: TwilioCallService; // optional in dev
}


export interface TicketType {
    name?: string;
    subject: string;
    full_name?: string;
    description?: string;
    status?: string;
    type?: string;
}



export function createOrderTools(deps: ToolDeps) {
    return {
        async createOrderTicket(ticket: Omit<TicketType, "name">): Promise<ToolResult<TicketType>> {
            try {
                if (!ticket?.subject?.trim()) {
                    throw new AppError("Missing ticket subject", "error", "MISSING_TICKET_SUBJECT");
                }

                const payload: Partial<TicketType> = {
                    subject: ticket.subject.trim(),
                    full_name: ticket.full_name,
                    description: ticket.description,
                    status: "New",
                    type: "Order / Shipping",
                };

                const createdTicket = await deps.frappe.createDoc<TicketType>("Ticket", payload);
                return { status: "ok", data: createdTicket };
            } catch (e: any) {
                return {
                    status: "error",
                    message: "Failed to create ticket",
                    code: e?.code ?? "CREATE_TICKET_FAILED",
                    details: e?.message ?? String(e),
                };
            }
        },
        async getOrderDetails({ order_id: orderId }: { order_id: string }): Promise<ToolResult<Job>> {
            try {
                if (!orderId) throw new AppError("Missing order_id", "error", "MISSING_ORDER_ID");
                const order = await deps.frappe.getDoc<Job>("Order", orderId, ["*"]);
                return { status: "ok", data: order };
            } catch (e: any) {
                return {
                    status: "error",
                    message: `Failed to retrieve order details for order_id: ${orderId}`,
                    code: e?.code ?? "GET_ORDER_DETAILS_FAILED",
                    details: e?.message ?? String(e),
                };
            }
        },
        async updateOrderAddress({ order_id: orderId, new_address: newAddress }: { order_id: string, new_address: string }): Promise<ToolResult<Job>> {
            try {
                if (!orderId) throw new AppError("Missing order_id", "error", "MISSING_ORDER_ID");
                if (!newAddress) throw new AppError("Missing new address", "error", "MISSING_NEW_ADDRESS");
                const order = await deps.frappe.getDoc<Job>("Order", orderId, ["*"]);
                if (order.status === "shipped") {
                    throw new AppError("Cannot update address for shipped orders", "error", "ORDER_ALREADY_SHIPPED");
                }
                const updatedOrder = await deps.frappe.updateDoc<Job>("Order", orderId, { address: newAddress });
                return { status: "ok", data: updatedOrder };
            } catch (e: any) {
                return {
                    status: "error",
                    message: `Failed to update address for order_id: ${orderId}`,
                    code: e?.code ?? "UPDATE_ORDER_ADDRESS_FAILED",
                    details: e?.message ?? String(e),
                };
            }
        },

    };
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

        async getJobUpdates(jobId: string, stage?: string): Promise<ToolResult<Update[]>> {
            try {
                if (!jobId) throw new AppError("Missing job_id", "error", "MISSING_JOB_ID");
                let filters: any[] = [["job", "=", jobId]];
                if (stage) {
                    filters.push(["reference_doctype", "=", stage]);
                }
                const updates = await deps.frappe.list<Update>("Update", {
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
