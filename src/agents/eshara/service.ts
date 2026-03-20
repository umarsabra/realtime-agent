import "dotenv/config";
import { ToolResult } from "../../core/Agent";
import { AppError } from "../../utils";
import { FrappeClient } from "../../utils/FrappeClient";



const FRAPPE_API_KEY = process.env.FRAPPE_API_KEY ?? "";
const FRAPPE_API_SECRET = process.env.FRAPPE_API_SECRET ?? "";
const FRAPPE_BASE_URL = process.env.FRAPPE_BASE_URL ?? "https://app.midwestsolutions.com";


const frappe = new FrappeClient({
    baseUrl: FRAPPE_BASE_URL,
    apiKey: FRAPPE_API_KEY,
    apiSecret: FRAPPE_API_SECRET,
    timeoutMs: 10_000,
    retries: 1,
});




export interface TicketType {
    subject: string;
    name?: string;
    full_name?: string;
    description?: string;
    status?: string;
    type?: string;
}





export async function createOrderTicket(ticket: Omit<TicketType, "name">): Promise<ToolResult<TicketType>> {
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

        const createdTicket = await frappe.createDoc<TicketType>("Ticket", payload);
        return { status: "ok", data: createdTicket };
    } catch (e: any) {
        return {
            status: "error",
            message: "Failed to create ticket",
            code: e?.code ?? "CREATE_TICKET_FAILED",
            details: e?.message ?? String(e),
        };
    }
}




export async function getOrderDetails({ order_id: orderId }: { order_id: string }): Promise<ToolResult<any>> {
    try {
        if (!orderId) throw new AppError("Missing order_id", "error", "MISSING_ORDER_ID");
        const order = await frappe.getDoc<any>("Order", orderId, ["*"]);
        return { status: "ok", data: order };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve order details for order_id: ${orderId}`,
            code: e?.code ?? "GET_ORDER_DETAILS_FAILED",
            details: e?.message ?? String(e),
        };
    }
}




export async function updateOrderAddress({ order_id: orderId, new_address: newAddress }: { order_id: string, new_address: string }): Promise<ToolResult<any>> {
    try {
        if (!orderId) throw new AppError("Missing order_id", "error", "MISSING_ORDER_ID");
        if (!newAddress) throw new AppError("Missing new address", "error", "MISSING_NEW_ADDRESS");
        const order = await frappe.getDoc<any>("Order", orderId, ["*"]);
        if (order.status === "shipped") {
            throw new AppError("Cannot update address for shipped orders", "error", "ORDER_ALREADY_SHIPPED");
        }
        const updatedOrder = await frappe.updateDoc<any>("Order", orderId, { address: newAddress });
        return { status: "ok", data: updatedOrder };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to update address for order_id: ${orderId}`,
            code: e?.code ?? "UPDATE_ORDER_ADDRESS_FAILED",
            details: e?.message ?? String(e),
        };
    }
}








export async function getConversationMessages({ conversation_id }: { conversation_id?: string }): Promise<ToolResult<any>> {
    try {
        let filters = [];
        if (conversation_id) {
            filters.push(["conversation", "=", conversation_id]);
        }

        const messages = await frappe.getList<any>("Conversation Message", {
            filters,
            fields: ["*"],
            order_by: "creation desc",
        });

        return { status: "ok", data: messages };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve messages for conversation_id: ${conversation_id}`,
            code: e?.code ?? "GET_CONVERSATION_MESSAGES_FAILED",
            details: e?.message ?? String(e),
        };
    }
}



export async function getContactByConversationId({ conversation_id }: { conversation_id: string }): Promise<ToolResult<any>> {
    try {
        if (!conversation_id) throw new AppError("Missing conversation_id", "error", "MISSING_CONVERSATION_ID");
        const conversation = await frappe.getDoc<any>("Conversation", conversation_id, ["*"]);
        if (!conversation?.contact) {
            throw new AppError("Conversation does not have an associated contact", "error", "CONVERSATION_NO_CONTACT");
        }
        const contact = await frappe.getDoc<any>("CRM Contact", conversation.contact, ["*"]);
        return { status: "ok", data: contact };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve contact for conversation_id: ${conversation_id}`,
            code: e?.code ?? "GET_CONTACT_BY_CONVERSATION_FAILED",
            details: e?.message ?? String(e),
        };
    }
}


export async function getConversationsById({ conversation_id }: { conversation_id: string }): Promise<ToolResult<any>> {
    try {
        if (!conversation_id) throw new AppError("Missing conversation_id", "error", "MISSING_CONVERSATION_ID");
        const conversation = await frappe.getDoc<any>("Conversation", conversation_id, ["*"]);
        return { status: "ok", data: conversation };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve conversation for conversation_id: ${conversation_id}`,
            code: e?.code ?? "GET_CONVERSATION_FAILED",
            details: e?.message ?? String(e),
        };
    }
}


export async function getContact({ contact_id }: { contact_id: string }): Promise<ToolResult<any>> {
    try {
        if (!contact_id) throw new AppError("Missing contact_id", "error", "MISSING_CONTACT_ID");
        const contact = await frappe.getDoc<any>("CRM Contact", contact_id, ["*"]);
        return { status: "ok", data: contact };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve contact for contact_id: ${contact_id}`,
            code: e?.code ?? "GET_CONTACT_FAILED",
            details: e?.message ?? String(e),
        };
    }
}


export async function getConversationsByContact({ contact_id }: { contact_id: string }): Promise<ToolResult<any>> {
    try {
        if (!contact_id) throw new AppError("Missing contact_id", "error", "MISSING_CONTACT_ID");
        const conversations = await frappe.getList<any>("Conversation", {
            filters: [["contact", "=", contact_id]],
            fields: ["*"],
            order_by: "creation desc",
            limit_page_length: 5,
        });
        return { status: "ok", data: conversations };
    } catch (e: any) {
        return {
            status: "error",
            message: `Failed to retrieve conversations for contact_id: ${contact_id}`,
            code: e?.code ?? "GET_CONVERSATIONS_FAILED",
            details: e?.message ?? String(e),
        };
    }
}   
