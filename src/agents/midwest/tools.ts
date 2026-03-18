import { AgentTool } from "../../service/openai";
import { authenticateSession, middlewares, sessions } from "./middlewares";
import { getAccountByAccountNumberAndPin, getAccountByPhoneNumber, getJobDetails, getJobUpdates } from "./service";






export const tools: AgentTool[] = [
    {
        type: "function",
        name: "get_job_updates",
        middlewares,
        description:
            `Look up the latest updates/activities logged for a customer's job/project based on the job ID provided by the caller.
            Optionally filter updates by stage (Design, Permit, PTO, Inspection, Utility).`,
        parameters: {
            type: "object",
            properties: {
                job_id: {
                    type: "string",
                    description: "Job ID provided by the caller to look up their job updates. The Job ID does not include dashes for example MWS9293 instead of MWS-9293.",
                },
                stage: {
                    type: "string",
                    description: "Stage to filter the updates.",
                    enum: ["Design", "Permit", "PTO", "Inspection", "Utility"],
                }
            },
            required: ["job_id"],
        },
        execute: (args) => getJobUpdates(args as { job_id: string; stage?: string }),
        onSuccess: ({ agent, result, args }) => {
            agent.sendResponseCreate("Tell the caller the latest updates on their job in plain English.");
        },
    },
    {
        type: "function",
        name: "get_job_details",
        middlewares,
        description: "Look up the details for a customer's job/project based on the job ID provided by the caller.",
        parameters: {
            type: "object",
            properties: {
                job_id: {
                    type: "string",
                    description: "Job ID provided by the caller to look up their job details. The Job ID does not include dashes for example MWS9293 instead of MWS-9293.",
                },
            },
            required: ["job_id"],
        },
        execute: (args) => getJobDetails(args as { job_id: string }),
        onSuccess: ({ agent, result, args }) => {
            agent.sendResponseCreate("Tell the caller the details of their job in plain English.");
        },
    },
    {
        type: "function",
        name: "get_account_by_account_number_and_pin",
        description:
            "Look up the details for a customer's account based on their account number and PIN.",
        parameters: {
            type: "object",
            properties: {
                account_number: {
                    type: "string",
                    description: "Account number provided by the caller to look up their account details.",
                },
                pin_code: {
                    type: "string",
                    description: "PIN code provided by the caller to look up their account details.",
                },
            },
            required: ["account_number", "pin_code"],
        },
        execute: (args) => getAccountByAccountNumberAndPin(args as { account_number: string; pin_code: string }),
        onSuccess: authenticateSession,
    }
];

