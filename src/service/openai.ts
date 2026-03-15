import Connection from "./Connection";
import { WebSocket } from "ws";
export class OpenAIAgent {

    private socket: WebSocket;

    private instructions: string;
    private pendingResponses: Map<string, string> = new Map();

    constructor(socket: WebSocket, instructions: string) {
        this.socket = socket
        this.instructions = instructions;
    }



    private buildSessionUpdate() {

    }


    private init() {
        if (!this.ready) return;

        this.socket.on("open", () => {
            this.socket.send(JSON.stringify(this.buildSessionUpdate()));
        });


    }






    private get ready() {
        return this.socket && this.socket.readyState == WebSocket.OPEN;
    }



    public sendResponseCreate(instructions: string) {
        if (this.ready) {
            console.warn("[bridge] cannot send response.create, OpenAI WS not open");
            return;
        }

        // Prevent sending a new response.create if there's already a pending response for the current call
        if (this.pendingResponses.size > 0) {
            console.warn("[bridge] already have pending response for call_ids:", Array.from(this.pendingResponses.keys()));
            return;
        }

        this.socket.send(
            JSON.stringify({
                type: "response.create",
                response: { instructions },
            })
        );
        console.log("[bridge] sent response.create with instructions:", instructions);
    }




} 