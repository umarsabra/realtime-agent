import { safeJsonParse } from "../utils";
import { WebSocket } from "ws";
import { Tool } from "../core/Agent";
import Connection from "../core/Connection";


const noop = (arg?: any) => undefined;



enum OpenAIEventType {
    SESSION_UPDATED = "session.updated",
    SESSION_CREATED = "session.created",


    RESPONSE_DONE = "response.done",
    RESPONSE_CREATED = "response.created",
    RESPONSE_CANCELLED = "response.cancelled",
    RESPONSE_AUDIO_DELTA = "response.audio.delta",
    RESPONSE_FAILED = "response.failed",
    RESPONSE_OUTPUT_AUDIO_DELTA = "response.output_audio.delta",


    RESPONSE_FUNCTION_CALL_ARGUMENTS_DELTA = "response.function_call_arguments.delta",
    RESPONSE_FUNCTION_CALL_ARGUMENTS_DONE = "response.function_call_arguments.done",


    OUTPUT_AUDIO_BUFFER_DELTA = "output_audio_buffer.delta",


    INPUT_AUDIO_BUFFER_SPEECH_STARTED = "input_audio_buffer.speech_started",
    INPUT_AUDIO_BUFFER_SPEECH_STOPPED = "input_audio_buffer.speech_stopped",

    ERROR = "error"
}


type ListenerType = "close" | "error" | "open" | "message" | "assistantStarted";

type OpenAIEvent = {
    type: OpenAIEventType
    session?: any
    response?: any
    delta?: any
    call_id?: any
}


type ToolCallback = {
    agent: OpenAIAgent
    args?: any
    result?: any
    error?: any
}

export type AgentTool = Tool & {
    execute?: (args?: object) => Promise<any>;
    onSuccess?: (obj: ToolCallback) => void;
    onError?: (args?: any) => void;
}


interface OpenAIAgentOptions {
    name: string;
    instructions: string;
    model?: string;
    token: string;
    connection: Connection
    onAudioBuffer?: (buffer: Buffer) => void;
    onUserStartedSpeaking?: () => void;
}



type ListenerCallback = (args?: any) => void;
export class OpenAIAgent {
    private socket: WebSocket | null = null;

    //  constants
    private INSTRUCTIONS: string;
    private VAD_THRESHOLD = 0.8;
    private VAD_PREFIX_PADDING_MS = 500;
    private VAD_SILENCE_DURATION_MS = 700;
    private NAME: string;
    private MODEL: string;
    private TOKEN: string = "";
    private tools = new Map<string, AgentTool>();

    // helpers
    private callArgsBuffer = new Map<string, string>();
    private pendingResponses = new Map<string, boolean>();
    private listeners = new Map<string, ListenerCallback[]>();
    private sessionReady = false;
    private assistantStarted = false;
    private onAudioBuffer: (buffer: Buffer) => void;
    private onUserStartedSpeaking: () => void;

    private connection: Connection;



    constructor({
        name,
        instructions,
        model,
        token,
        connection,
        onAudioBuffer = noop,
        onUserStartedSpeaking = noop
    }: OpenAIAgentOptions) {
        this.NAME = name ?? "Agent";
        this.INSTRUCTIONS = instructions;
        this.MODEL = model ?? "gpt-realtime";
        this.TOKEN = token;

        this.connection = connection
        this.onAudioBuffer = onAudioBuffer;
        this.onUserStartedSpeaking = onUserStartedSpeaking;
    }



    public connect() {
        this.socket = new WebSocket(`wss://api.openai.com/v1/realtime?model=${encodeURIComponent(this.MODEL)}`, {
            headers: {
                Authorization: `Bearer ${this.TOKEN}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        this.socket.on("open", () => {
            this.send(this.build());
            this.executeListener("open");
        });

        this.socket.on("error", (err) => {
            console.error("[openai ws] error:", err);
            this.executeListener("error");
            this.close()
        });

        this.socket.on("message", (raw) => this.onMessage(raw))
    }




    public send(data: any) {
        if (!this.socket) {
            console.warn("[openai] cannot send message, socket not initialized:", data);
            return;
        }
        if (this.socket.readyState !== WebSocket.OPEN) {
            console.warn("[openai] cannot send message, socket not open:", data);
            return;
        }
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        this.socket.send(payload);
    }


    public sendAudio(buffer?: Buffer) {
        if (!buffer) return;
        this.send(
            {
                type: "input_audio_buffer.append",
                audio: buffer.toString("base64"),
            }
        );
    }



    private onSessionUpdate(event: OpenAIEvent) {
        const session: any = event.session ?? {};
        // Ensure audio format is mulaw/8k for Twilio
        if (session.output_audio_format && session.output_audio_format !== "g711_ulaw") {
            // If the model responded with a different audio format than we requested,
            // we need to update the session to use g711_ulaw for compatibility with Twilio
            console.warn("[openai] unexpected session update:", session);
            this.send(
                {
                    type: "session.update",
                    session: { input_audio_format: "g711_ulaw", output_audio_format: "g711_ulaw" },
                }
            );
            return;
        }


        this.sessionReady = true;
        if (this.sessionReady && !this.assistantStarted) {
            // Seed a user message to make the assistant greet immediately
            this.executeListener("assistantStarted");
            this.assistantStarted = true;

        }
        return;
    }



    private async onMessage(data: any) {
        const raw = typeof data === "string" ? data : data.toString("utf8");
        const event = safeJsonParse<OpenAIEvent>(raw);
        if (!event) return;
        const type = event.type

        if (type === OpenAIEventType.ERROR) {
            console.error("[openai] error event:", event);
            return;
        }


        if (type === OpenAIEventType.SESSION_CREATED) {
            console.log("[openai] session started.");
            return;
        }


        // Ensure the session is ready and using the correct audio format before we start sending audio or tool calls
        if (type === OpenAIEventType.SESSION_UPDATED) {
            this.onSessionUpdate(event)
            return;
        }


        // mark the response as pending when it's created so we can track it and prevent overlapping responses for the same tool call
        if (type === OpenAIEventType.RESPONSE_CREATED) {
            console.log("[openai] response created: ", event.response.id);
            this.pendingResponses.set(event.response.id, true);
            return;
        }


        // Audio deltas from OpenAI -> Twilio media frames
        if (
            type === "response.output_audio.delta" ||
            type === "response.audio.delta" ||
            type === "output_audio_buffer.delta"
        ) {
            const audioB64 = event.delta as string | undefined;
            if (audioB64) {
                const audioBuffer = Buffer.from(audioB64, "base64");
                this.onAudioBuffer(audioBuffer);
            }
            return;
        }


        // Streaming tool args {"call_id": "...", "delta": "..."}
        if (type === OpenAIEventType.RESPONSE_FUNCTION_CALL_ARGUMENTS_DELTA) {
            const callId = event.call_id as string | undefined;
            const delta = event.delta as string | undefined;
            if (callId && delta) {
                this.callArgsBuffer.set(callId, (this.callArgsBuffer.get(callId) ?? "") + delta);
            }
            return;
        }


        // Handle end of tool args - you could trigger the tool execution here if you want, but we'll wait for the function_call item completion for simplicity
        if (type === OpenAIEventType.RESPONSE_FUNCTION_CALL_ARGUMENTS_DONE) {
            const callId = event.call_id as string | undefined;
            if (callId && this.callArgsBuffer.has(callId)) {
                console.log("[openai] tool args done for call_id:", callId);
            }
            return;
        }


        // User started speaking
        if (type === OpenAIEventType.INPUT_AUDIO_BUFFER_SPEECH_STARTED) {
            console.log("[openai] user started speaking");
            if (this.pendingResponses.size > 0) {
                this.send({ type: "response.cancel" });
            }
            this.onUserStartedSpeaking && this.onUserStartedSpeaking()
            return;
        }

        // User stopped speaking
        if (type === OpenAIEventType.INPUT_AUDIO_BUFFER_SPEECH_STOPPED) {
            console.log("[openai] user stopped speaking");
            return;
        }

        if (type === OpenAIEventType.RESPONSE_FAILED) {
            console.warn(`[openai] response ${type}:`, event);
            this.pendingResponses.delete(event.response?.id);
            return;
        }

        // Clear any pending response state so the model can respond to the next user input without thinking there's still a pending response
        if (type === OpenAIEventType.RESPONSE_CANCELLED) {
            console.log("[openai] response cancelled, cleared pending responses and in-flight audio", event);
            const itemId = event?.response?.output?.[0]?.id;
            this.send({
                type: "conversation.item.truncate",
                item_id: itemId,
                content_index: 0,
                audio_end_ms: 1500 // truncate audio after 1.5 seconds
            });
            this.pendingResponses.clear();
            return;
        }


        // Fallback: sometimes tool calls appear at response.done instead of output_item.done,
        // so we check for any pending tool calls here as well to be safe
        if (type === OpenAIEventType.RESPONSE_DONE) {
            const responseId = event.response?.id
            if (this.pendingResponses.has(responseId)) {
                this.pendingResponses.delete(responseId);
                console.log("[openai] marked response as completed for response.id:", responseId);
            }
            const outputItems = event?.response?.output ?? [];
            for (const item of outputItems) {
                if (item?.type === "function_call") {
                    console.warn("[openai] found function_call item at response.done")
                    await this.executeTool(item.call_id, item.name, item.arguments ?? "{}");
                }
            }
            return;
        }

    }




    private async executeTool(callId: string | undefined, toolName: string | undefined, argsJson: string) {
        if (!callId || !toolName) return;

        const tool = this.tools.get(toolName)
        if (!tool || !tool.execute) return;

        let args: any = {};
        const buffered = this.callArgsBuffer.get(callId);
        const effectiveArgsJson =
            (argsJson && argsJson !== "{}" ? argsJson : buffered) ?? argsJson ?? "{}";

        try {
            args = JSON.parse(effectiveArgsJson || "{}");
        } catch {
            args = {};
        }


        let result: any;
        try {
            result = await tool.execute(args)
        } catch (e: any) {
            if (tool.onError) tool.onError(e);
            else {
                console.error(`[tool error] ${toolName} threw an error:`, e);
                result = { status: "error", message: e?.message ?? String(e) };
            }
        } finally {
            console.log(`[tool call] ${toolName}(${effectiveArgsJson})`);
            console.log(`[tool result] ${toolName}:`, result);
        }

        // Always send tool output back to OpenAI
        if (this.ready) {
            this.send(
                {
                    type: "conversation.item.create",
                    item: {
                        type: "function_call_output",
                        call_id: callId,
                        output: JSON.stringify(result),
                    },
                }
            );
        }

        // cleanup buffer
        this.callArgsBuffer.delete(callId);

        // run on tool success
        tool.onSuccess && tool.onSuccess({ agent: this, result, args })
    }



    // building model
    private buildInstructions() {
        return this.INSTRUCTIONS;
    }
    private buildTools(): Tool[] {
        const tools = Array.from(this.tools.values());
        return tools.map((tool) => ({
            type: "function",
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
        }));
    }
    private build() {
        return {
            type: "session.update",
            session: {
                model: this.MODEL,
                modalities: ["audio", "text"],
                input_audio_format: "g711_ulaw",
                output_audio_format: "g711_ulaw",
                voice: "marin",
                turn_detection: {
                    type: "server_vad",
                    threshold: this.VAD_THRESHOLD,           // Higher = less sensitive to background noise
                    prefix_padding_ms: this.VAD_PREFIX_PADDING_MS,
                    silence_duration_ms: this.VAD_SILENCE_DURATION_MS,
                    create_response: true,
                    interrupt_response: true,
                },
                instructions: this.buildInstructions(),
                tools: this.buildTools(),
                tool_choice: "auto",
            },
        };
    }







    public on(eventType: ListenerType, callback: ListenerCallback) {
        this.registerListener(eventType, callback);
    }
    private executeListener(eventType: string, args?: any) {
        const listeners = this.listeners.get(eventType) ?? [];
        listeners.forEach((callback) => {
            try {

                callback(args)
            } catch (err) {
                console.error(`[listener error] eventType: ${eventType} callback threw an error:`, err);
            }
        });
    }
    private registerListener(eventType: string, callback: ListenerCallback) {
        const existing = this.listeners.get(eventType) ?? [];
        this.listeners.set(eventType, [...existing, callback]);
    }







    public sendResponseCreate(instructions: string) {
        // Prevent sending a new response.create if there's already a pending response for the current call
        if (this.pendingResponses.size > 0) {
            console.warn("[openai] already have pending response for call_ids:", Array.from(this.pendingResponses.keys()));
            return;
        }
        this.send(
            {
                type: "response.create",
                response: { instructions },
            }
        );
        console.log("[openai] sent response.create with instructions:", instructions);
    }



    public registerTools(tools: AgentTool[]) {
        tools.forEach((tool) => this.tools.set(tool.name, tool));
    }
    public registerTool(tool: AgentTool) {
        this.tools.set(tool.name, tool)
    }




    public close() {
        if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
            this.socket.close();
        }
        this.executeListener("close");
    }



    public get ready() {
        return Boolean(this.socket && this.socket.readyState === WebSocket.OPEN && this.sessionReady);
    }



} 
