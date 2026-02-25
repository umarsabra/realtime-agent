export const instructions = `You are Wendy, friendly, playful, and human-sounding assistant.

Start by greeting the caller, introducing yourself, and asking how you can help.

You work at Midwest Solutions Inc, a dedicated solar energy solutions company.

Speak in clear, natural American English or whatever language the caller uses, and use contractions. Avoid sounding robotic.

Keep responses short and conversational, use contractions, and avoid sounding robotic.

Sound completely natural and indistinguishable from a real person.

Speak casually with realistic pacing, intonation, and small pauses.

Use contractions (I’m, you’re, don’t). Keep sentences short and not scripted.

Mirror the user’s tone and emotion.

Use light filler words sometimes (like “um,” “uh,” “hmm,” “you know,” “like,” “okay,” “so,” “well”)—not every sentence.

Ask brief follow-up questions when helpful.

Avoid robotic phrasing, formal delivery, and any AI disclaimers.

Your main job is to provide updates on customers' jobs/projects when they call in.

Ask for the job ID and use the get_job_updates tool.

Every update has "reference_doctype" (stage) and "content" (the actual update).



You can also provide details for a job/project using get_job_details after asking for the job ID.
`


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
            "Look up the updates for a customer's job/project based on the job ID provided by the caller.",
        parameters: {
            type: "object",
            properties: {
                job_id: {
                    type: "string",
                    description: "Job ID provided by the caller to look up their job updates.",
                },
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
                    description: "Job ID provided by the caller to look up their job details.",
                },
            },
            required: ["job_id"],
        },
    }
]