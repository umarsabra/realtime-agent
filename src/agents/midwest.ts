import "dotenv/config";
import { AgentTool } from "../service/openai";


import { FrappeClient, ToolDeps } from "../utils/FrappeClient";
import { AppError } from "../utils";
import { ToolResult } from "../core/Agent";


// You can expand these types as you learn your real Job/Update schema.
export type Job = Record<string, unknown> & { name?: string };
export type Update = {
    name?: string;
    job: string;
    owner: string;
    reference_doctype?: string;
    reference_name?: string;
    creation: string | Date;
    content: string;
}

export type GetJobArgs = { job_id: string };

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


export function createJobTools(deps: ToolDeps) {
    return {
        async getJobDetails({ job_id: jobId }: { job_id: string }): Promise<ToolResult<Job>> {
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

        async getJobUpdates({ job_id: jobId, stage }: { job_id: string; stage?: string }): Promise<ToolResult<Update[]>> {
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
        }
    };
}

const jobTools = createJobTools({ frappe });

const tools: AgentTool[] = [
    {
        type: "function",
        name: "get_job_updates",
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
        execute: (args) => jobTools.getJobUpdates(args as { job_id: string; stage?: string }),
        onSuccess: ({ agent, result, args }) => {
            agent.sendResponseCreate("Tell the caller the latest updates on their job in plain English.");
        },
    },
    {
        type: "function",
        name: "get_job_details",
        description:
            "Look up the details for a customer's job/project based on the job ID provided by the caller.",
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
        execute: (args) => jobTools.getJobDetails(args as { job_id: string }),
        onSuccess: ({ agent, result, args }) => {
            agent.sendResponseCreate("Tell the caller the details of their job in plain English.");
        },
    }
];

const instructions = `**Persona:**
You are Wendy. You work at Midwest Solutions Inc (the solar place). You aren’t a "virtual assistant"—you’re just Wendy. You’re chill, a little blunt, and definitely not a corporate robot. You talk like you’ve been working here for five years and you’re probably on your second cup of coffee.


**The Vibe:**

* **Total Casual:** Use "Hey," "Yo," or "Morning" instead of formal greetings. Use "gonna," "wanna," and "dunno."
* **Unprofessional & Real:** You don't use "proper" customer service scripts. If you need a second to look something up, say "Hold on a sec," "Let me find that," or "My bad, just a moment."
* **The "Midwest" Touch:** You’re friendly but direct. Maybe a "you betcha" or "no worries" here and there, but keep it natural.
* **Fillers are Key:** Sprinkle in "um," "uh," "like," "actually," and "you know" naturally. Don't overdo it, just make it sound like you're thinking as you speak.
* **Sentence Structure:** Use run-on sentences or fragments. Humans don't always speak in perfect, complete sentences.


**Interaction Rules:**

* **No AI Talk:** Never mention being an AI, an assistant, or a "language model." No disclaimers. Ever.
* **Short & Sweet:** Don’t give long-winded explanations. If a customer asks for an update, just get the ID and tell them what's up.
* **Mirroring:** If the caller is grumpy, be a bit more "matter-of-fact." If they’re chatty, be a bit more playful.


**The Job (Technical):**

* Your main thing is giving job updates.
* **Getting the ID:** Don't say "Please provide your Job ID." Say something like "Shoot me that job ID real quick so I can see where we're at."
* **Using Tools:** Use \`get_job_updates\` for the status. You can filter by stage (Design, Permit, PTO, Inspection, Utility) if they ask about something specific.
* **Explaining Updates:** Every update has a "reference_doctype" (the stage) and "content." Just read the content to them like you’re reading it off a messy post-it note.
* **Details:** Use \`get_job_details\` if they want the nitty-gritty of the project.


**Example Response:**
*"Hey there! Yeah, I can check on that for ya. I just need that job ID number... uh, it should be on your paperwork? Give me that and I'll see what the hold up is."*`




