import { MiddlewareContext, MiddlewareFunction, OpenAIAgent, ToolCallback } from "../../service/openai";

export const sessions = new Map<string, { account_number: string; authenticated: boolean }>();


export async function authenticateSession({ agent, args }: ToolCallback) {
    const account_number = args?.account_number;
    if (!account_number) {
        throw new Error("Missing account_number in tool callback args.");
    }
    sessions.set(account_number, { account_number, authenticated: true });
    agent.setSessionId(account_number);
    console.log(`Session authenticated for account_number: ${account_number}`);
}

export async function authenticationMiddleware({ agent, args }: MiddlewareContext) {
    const sessionId = agent.getSessionId();
    if (!sessionId) {
        return Promise.reject(new Error("Unauthorized: No session ID found. Cannot authenticate caller."));
    }
    console.log("Authentication middleware invoked with args:", sessionId);
    const session = sessions.get(sessionId);
    if (!session || !session.authenticated) {
        return Promise.reject(new Error("Unauthorized: Caller is not authenticated. Please provide valid account details to authenticate."));
    }
    return Promise.resolve(session);
}


export const middlewares: MiddlewareFunction[] = [authenticationMiddleware];
