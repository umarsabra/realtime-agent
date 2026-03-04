import "dotenv/config";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-realtime";
const VAD_THRESHOLD = Number(process.env.VAD_THRESHOLD ?? 0.8);
const VAD_PREFIX_PADDING_MS = Number(process.env.VAD_PREFIX_PADDING_MS ?? 500);
const VAD_SILENCE_DURATION_MS = Number(process.env.VAD_SILENCE_DURATION_MS ?? 700);




export const instructions = `**Persona:**
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


type Tool = {
    type: string;
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            [key: string]: {
                type: string;
                description: string;
                enum?: string[];
            };
        };
        required: string[];
    };
};


export const tools: Tool[] = [
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
    }
]



export function buildSessionUpdate() {
    return {
        type: "session.update",
        session: {
            model: OPENAI_MODEL,
            modalities: ["audio", "text"],
            input_audio_format: "g711_ulaw",
            output_audio_format: "g711_ulaw",
            voice: "marin",
            turn_detection: {
                type: "server_vad",
                threshold: VAD_THRESHOLD,           // Higher = less sensitive to background noise
                prefix_padding_ms: VAD_PREFIX_PADDING_MS,
                silence_duration_ms: VAD_SILENCE_DURATION_MS,
                create_response: true,
                interrupt_response: true,
            },
            instructions,
            tools,
            tool_choice: "auto",
        },
    };
}