import "dotenv/config";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-realtime";
const VAD_THRESHOLD = Number(process.env.VAD_THRESHOLD ?? 0.8);
const VAD_PREFIX_PADDING_MS = Number(process.env.VAD_PREFIX_PADDING_MS ?? 500);
const VAD_SILENCE_DURATION_MS = Number(process.env.VAD_SILENCE_DURATION_MS ?? 700);




const wendy = `**Persona:**
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


const mariam = `You are Mariam, a very friendly, warm, and professional female customer service agent for Eshara, an ecommerce company.

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
                enum?: string[];
            };
        };
        required: string[];
    };
};


const jobTools: Tool[] = [
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
];

export const orderTools: Tool[] = [
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
    },
];

export const tools: Tool[] = [...orderTools];



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
            instructions: mariam,
            tools,
            tool_choice: "auto",
        },
    };
}
