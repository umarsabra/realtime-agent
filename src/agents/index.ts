import { OpenAIAgent } from "../core/OpenAIAgent";
import { buildEndCallTool as buildMidwestEndCallTool, instructions as midwestInstructions, onAgentStart as onMidwestAgentStart, tools as midwestTools } from "./midwest";
import { buildEndCallTool as buildEsharaEndCallTool, instructions as esharaInstructions, onAgentStart as onEsharaAgentStart, tools as esharaTools } from "./eshara";
import Connection from "../core/Connection";


const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-realtime";



// Register tools and connect the agent to start processing media and events from the connection.
export const buildMidwestAgent = (connection: Connection, scheduleHangup: any) => {
    const agent = new OpenAIAgent({
        name: "Wendy",
        instructions: midwestInstructions,
        connection,
        token: process.env.OPENAI_API_KEY ?? "",
        model: OPENAI_MODEL,
        defaultToolMiddlewares: [
            async ({ agent, args }) => {
                console.log(`[tool middleware] ${args.toolName} called with args:`, args);
            }
        ]
    })

    agent.registerTools([...midwestTools, buildMidwestEndCallTool(scheduleHangup)]);
    return agent;
}


export const buildEsharaAgent = (connection: Connection, scheduleHangup: any) => {
    const agent = new OpenAIAgent({
        name: "Mariam",
        instructions: esharaInstructions,
        connection,
        token: process.env.OPENAI_API_KEY ?? "",
        model: OPENAI_MODEL,
        defaultToolMiddlewares: [
            async ({ agent, args }) => {
                console.log(`[tool middleware] ${args.toolName} called with args:`, args);
            }
        ]
    })

    agent.registerTools([...esharaTools, buildEsharaEndCallTool(scheduleHangup)]);
    return agent;
}



export function buildExtensionAgent(connection: Connection, scheduleHangup: any) {
    const extension = connection.getExtension();
    console.log(`[agents] Building agent for extension ${extension}`);
    switch (extension) {
        case "11":
            return buildEsharaAgent(connection, scheduleHangup);
        case "12":
            return buildMidwestAgent(connection, scheduleHangup);
        default:
            console.warn(`[agents] No specific agent found for extension ${extension}, using Midwest as default`);
            return buildMidwestAgent(connection, scheduleHangup);
    }
}

export function onExtensionAgentStart(connection: Connection, agent: OpenAIAgent) {
    const extension = connection.getExtension();
    switch (extension) {
        case "11":
            return onEsharaAgentStart(agent);
        case "12":
            return onMidwestAgentStart(agent);
        default:
            return onMidwestAgentStart(agent);
    }
}
