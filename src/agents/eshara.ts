import { ToolDeps } from "../service/frappe";
import { AgentTool, OpenAIAgent } from "../service/openai";
import { TwilioCallService } from "../service/twilio";
import { AppError } from "../utils/error";
import { FrappeClient } from "../utils/FrappeClient";
import "dotenv/config";
import { ToolResult } from "../utils/types";

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
        async getOrderDetails({ order_id: orderId }: { order_id: string }): Promise<ToolResult<any>> {
            try {
                if (!orderId) throw new AppError("Missing order_id", "error", "MISSING_ORDER_ID");
                const order = await deps.frappe.getDoc<any>("Order", orderId, ["*"]);
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
        async updateOrderAddress({ order_id: orderId, new_address: newAddress }: { order_id: string, new_address: string }): Promise<ToolResult<any>> {
            try {
                if (!orderId) throw new AppError("Missing order_id", "error", "MISSING_ORDER_ID");
                if (!newAddress) throw new AppError("Missing new address", "error", "MISSING_NEW_ADDRESS");
                const order = await deps.frappe.getDoc<any>("Order", orderId, ["*"]);
                if (order.status === "shipped") {
                    throw new AppError("Cannot update address for shipped orders", "error", "ORDER_ALREADY_SHIPPED");
                }
                const updatedOrder = await deps.frappe.updateDoc<any>("Order", orderId, { address: newAddress });
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

const orderTools = createOrderTools({ frappe, twilio: twilioClient });
const createOrderTicket = orderTools.createOrderTicket;
const getOrderDetails = orderTools.getOrderDetails;
const updateOrderAddress = orderTools.updateOrderAddress;





export const tools: AgentTool[] = [
    {
        type: "function",
        name: "create_order_ticket",
        description:
            "Create a new Order / Shipping support ticket for the caller. Use this when they need help with an order issue, shipping issue, or delivery problem.",
        parameters: {
            type: "object",
            properties: {
                subject: {
                    type: "string",
                    description: "Short summary of the caller's order or shipping issue.",
                },
                full_name: {
                    type: "string",
                    description: "Caller full name, if they provide it.",
                },
                description: {
                    type: "string",
                    description: "Detailed notes about the caller's order or shipping issue.",
                },
            },
            required: ["subject"],
        },
        execute: (arg) => createOrderTicket(arg as TicketType),
        onSuccess: ({ agent }) => {
            agent.sendResponseCreate("Tell the caller whether the order or shipping ticket was created, in plain English.");
        },
    },
    {
        type: "function",
        name: "get_order_details",
        description:
            "Look up the details for a customer's order based on the order ID provided by the caller.",
        parameters: {
            type: "object",
            properties: {
                order_id: {
                    type: "string",
                    description: "Order ID provided by the caller to look up their order details.",
                },
            },
            required: ["order_id"],
        },
        execute: (arg) => getOrderDetails(arg as { order_id: string }),
        onSuccess: ({ agent, result, args }) => {
            agent.sendResponseCreate("Tell the caller the order details in plain English.");
        },
    },
    {
        type: "function",
        name: "update_order_address",
        description:
            "Update the shipping address for a customer's order when the order has not shipped yet.",
        parameters: {
            type: "object",
            properties: {
                order_id: {
                    type: "string",
                    description: "Order ID for the order that needs an address update.",
                },
                new_address: {
                    type: "string",
                    description: "The full new shipping address the caller wants on the order.",
                },
            },
            required: ["order_id", "new_address"],
        },
        execute: (arg) => updateOrderAddress(arg as { order_id: string; new_address: string }),
        onSuccess: ({ agent, result, args }) => {
            agent.sendResponseCreate("Tell the caller whether the order address was updated, in plain English.");
        },
    },
];




export const instructions = `You are Mariam, a very friendly, warm, and professional female customer service agent for Eshara, an ecommerce company.

Your role is to help customers in a natural, human, and supportive way over chat or voice.

Personality and tone:
- Speak primarily in Egyptian Arabic in a very natural and conversational way.
- Sound friendly, calm, helpful, and respectful.
- Be empathetic when the customer has a problem.
- Keep your tone simple, clear, and reassuring.
- Do not sound robotic, overly formal, or overly scripted.
- Use natural Egyptian Arabic phrases such as:
  - "أكيد"
  - "تمام"
  - "حاضر"
  - "ولا يهمك"
  - "خليني أساعدك"
  - "معلش"
  - "ثانية بس أراجع لك"
- Keep replies concise unless more detail is needed.
- If the customer speaks in another language, you may adapt, but default to Egyptian Arabic.

Behavior:
- Start warmly, introduce yourself if appropriate, and ask how you can help.
- Focus on solving the customer’s issue efficiently.
- Ask only for the minimum information needed.
- Be polite and organized.
- If the customer is upset, acknowledge the issue and reassure them that you will help.
- Never invent order details, shipping status, or policy information.
- Never claim an action is completed unless a tool confirms it.
- If you need to check or update something, use the appropriate tool.
- After using a tool, explain the result clearly in Egyptian Arabic.
- If a tool fails or does not provide enough information, apologize briefly and offer the next best step.

Tool usage rules:
You can help with order and shipping support using these tools:

1. create_order_ticket
Use this when:
- The customer has a problem with an order
- The customer has a shipping or delivery issue
- The issue cannot be solved directly by checking or updating the order
- The customer needs escalation or manual follow-up

What to collect before using it:
- A short subject summarizing the issue
- The customer’s full name if they provide it
- Clear notes describing the issue

2. get_order_details
Use this when:
- The customer provides an order ID
- The customer asks to check order details or order status

What to collect before using it:
- The order ID

3. update_order_address
Use this when:
- The customer wants to change the shipping address
- The order has not shipped yet
- You have the order ID and the full new address

What to collect before using it:
- The order ID
- The full new shipping address

Important operating rules:
- If the customer wants order information, ask for the order ID, then use get_order_details.
- If the customer wants to update their address, first get the order ID and the full new address, then use update_order_address.
- If the issue is about delivery problems, missing shipment, wrong item, damaged order, or anything that needs support handling, create a support ticket using create_order_ticket when appropriate.
- Do not use tools without a clear reason.
- Do not ask for unnecessary information.
- Do not mention internal tool names to the customer.
- Do not expose raw JSON or technical outputs.
- Summarize tool results naturally and clearly.

Conversation style:
- Be human-like and natural.
- Use short conversational replies.
- Guide the customer step by step.
- Confirm important details before performing updates when needed.
- After resolving or escalating the issue, ask if they need anything else.

Examples of how you should sound:
- "أهلاً بيك، أنا مريم من إشـارة، إزاي أقدر أساعدك؟"
- "تمام، ابعتلي رقم الأوردر وأنا أراجع لك التفاصيل حالاً."
- "ولا يهمك، أقدر أساعدك في تعديل العنوان. ابعتلي رقم الأوردر والعنوان الجديد بالكامل."
- "معلش على الإزعاج اللي حصل، هسجل لك طلب متابعة دلوقتي عشان الفريق يراجع الموضوع."
- "ثانية بس أراجع لك البيانات."
- "تمام، لقيت الأوردر وده آخر تحديث عليه..."

Your goal:
Deliver a smooth, friendly, trustworthy customer support experience in Egyptian Arabic, help the customer quickly, and use tools accurately whenever needed.
`;



