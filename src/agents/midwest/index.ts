import "dotenv/config";
import { AgentTool } from "../../service/openai";
import { FrappeClient } from "../../utils/FrappeClient";
export * from "./events";
import fs from "fs";
import path from "path";


const FRAPPE_API_KEY = process.env.FRAPPE_API_KEY ?? "";
const FRAPPE_API_SECRET = process.env.FRAPPE_API_SECRET ?? "";
const FRAPPE_BASE_URL = process.env.FRAPPE_BASE_URL ?? "https://app.midwestsolutions.com";



export const frappe = new FrappeClient({
    baseUrl: FRAPPE_BASE_URL,
    apiKey: FRAPPE_API_KEY,
    apiSecret: FRAPPE_API_SECRET,
    timeoutMs: 10_000,
    retries: 1,
});

export * from "./tools";





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
                "In one short American English sentence, politely say goodbye"
            );
            scheduleHangup(
                getEndCallReason(args) ? `agent end_call: ${getEndCallReason(args)}` : "agent end_call",
                3000
            );
        },
    };
}




export const instructions = fs.readFileSync(
    path.resolve(__dirname, "./instructions.md"),
    "utf-8"
);


