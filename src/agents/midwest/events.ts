import { OpenAIAgent } from "../../service/openai";




export function onAgentStart(agent: OpenAIAgent) {
    agent.send(
        {
            type: "conversation.item.create",
            item: {
                type: "message",
                role: "system",
                content: [
                    {
                        type: "input_text",
                        text:
                            "Please greet the caller in clear American English, introduce yourself as Wendy from Midwest Solutions, and ask about their account details. (account number and pin_code) to assist them further.",
                    },
                ],
            },
        }
    );
    agent.sendResponseCreate("Greet the caller and ask about their account details.");
}