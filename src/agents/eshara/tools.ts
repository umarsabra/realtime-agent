import { AgentTool } from "../../core/OpenAIAgent";
import { createOrderTicket, getContactByConversationId, getConversationMessages, getOrderDetails, TicketType, updateOrderAddress } from "./service";




export const tools: AgentTool[] = [
    // {
    //     type: "function",
    //     name: "create_order_ticket",
    //     description:
    //         "Create a new Order / Shipping support ticket for the caller. Use this when they need help with an order issue, shipping issue, or delivery problem.",
    //     parameters: {
    //         type: "object",
    //         properties: {
    //             subject: {
    //                 type: "string",
    //                 description: "Short summary of the caller's order or shipping issue.",
    //             },
    //             full_name: {
    //                 type: "string",
    //                 description: "Caller full name, if they provide it.",
    //             },
    //             description: {
    //                 type: "string",
    //                 description: "Detailed notes about the caller's order or shipping issue.",
    //             },
    //         },
    //         required: ["subject"],
    //     },
    //     execute: (arg) => createOrderTicket(arg as TicketType),
    //     onSuccess: ({ agent }) => {
    //         agent.sendResponseCreate("Tell the caller whether the order or shipping ticket was created, in plain English.");
    //     },
    // },
    // {
    //     type: "function",
    //     name: "get_order_details",
    //     description:
    //         "Look up the details for a customer's order based on the order ID provided by the caller.",
    //     parameters: {
    //         type: "object",
    //         properties: {
    //             order_id: {
    //                 type: "string",
    //                 description: "Order ID provided by the caller to look up their order details.",
    //             },
    //         },
    //         required: ["order_id"],
    //     },
    //     execute: (arg) => getOrderDetails(arg as { order_id: string }),
    //     onSuccess: ({ agent, result, args }) => {
    //         agent.sendResponseCreate("Tell the caller the order details in plain English.");
    //     },
    // },
    // {
    //     type: "function",
    //     name: "update_order_address",
    //     description:
    //         "Update the shipping address for a customer's order when the order has not shipped yet.",
    //     parameters: {
    //         type: "object",
    //         properties: {
    //             order_id: {
    //                 type: "string",
    //                 description: "Order ID for the order that needs an address update.",
    //             },
    //             new_address: {
    //                 type: "string",
    //                 description: "The full new shipping address the caller wants on the order.",
    //             },
    //         },
    //         required: ["order_id", "new_address"],
    //     },
    //     execute: (arg) => updateOrderAddress(arg as { order_id: string; new_address: string }),
    //     onSuccess: ({ agent, result, args }) => {
    //         agent.sendResponseCreate("Tell the caller whether the order address was updated, in plain English.");
    //     },
    // },
    {
        type: "function",
        name: "get_all_conversation_messages",
        description: "Retrieve all conversation messages or messages for a specific conversation if conversation_id is provided. Each message includes conversation, status, content. conversation is the conversation ID the message belongs to.",
        parameters: {
            type: "object",
            properties: {
                conversation_id: {
                    type: "string",
                    description: "ID of the conversation to retrieve messages for.",
                },
            }
        },
        execute: (arg) => getConversationMessages(arg as { conversation_id?: string }),
        onSuccess: ({ agent, result, args }) => {
            agent.sendResponseCreate("Tell the caller the conversation messages in plain English.");
        },
    },
    {
        type: "function",
        name: "get_contact_by_conversation_id",
        description: "Look up the contact details based on the conversation ID. Conversation ID can be found in the metadata of incoming messages. Use this to lookup what contact sent a specific message. Return the contact's name, phone number, and email if available.",
        parameters: {
            type: "object",
            properties: {
                conversation_id: {
                    type: "string",
                    description: "ID of the conversation to look up the contact details for.",
                },
            },
            required: ["conversation_id"],
        },
        execute: (args) => getContactByConversationId(args as { conversation_id: string }),
        onSuccess: ({ agent, result, args }) => {
            agent.sendResponseCreate("Tell the caller the contact details in plain English.");
        },
    },
];




export function buildEndCallTool(scheduleHangup: (reason?: string, delayMs?: number) => void): AgentTool {
    const getEndCallReason = (args?: object) => {
        const value = (args as { reason?: unknown } | undefined)?.reason;
        return typeof value === "string" && value.trim() ? value.trim() : null;
    };
    return {
        type: "function",
        name: "end_call",
        description:
            "End the current phone call when the caller clearly wants to finish the conversation, says goodbye, or confirms they do not need anything else.",
        parameters: {
            type: "object",
            properties: {
                reason: {
                    type: "string",
                    description: "Short summary of why the call is ending.",
                },
            },
            required: [],
        },
        execute: async (args) => ({
            status: "ok",
            data: {
                ending: true,
                reason: getEndCallReason(args) ?? "caller requested to end the call",
            },
        }),
        onSuccess: ({ agent, args }) => {
            agent.sendResponseCreate(
                "In one short Egyptian Arabic sentence, politely say goodbye"
            );
            scheduleHangup(
                getEndCallReason(args) ? `agent end_call: ${getEndCallReason(args)}` : "agent end_call",
                3000
            );
        },
    };
}

