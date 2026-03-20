import { OpenAIAgent } from "../../core/OpenAIAgent";


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
                            "Please greet the caller in clear Egyptian Arabic, introduce yourself as Gamila from Eshara, and ask how you can help.",
                    },
                ],
            },
        }
    );
    agent.sendResponseCreate("Greet the caller and ask how you can help.");
}
