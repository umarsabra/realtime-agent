import { WebSocket } from "ws";

export default class Connection {
    public id: string | null | undefined;

    public websocket: WebSocket;


    setId(id?: string | null) {
        this.id = id
    }

    constructor(websocket: WebSocket, id: string | null) {
        this.id = id
        this.websocket = websocket;
    }

    close(code?: number, reason?: any) {
        this.websocket.close(code, reason);
    }

    clear() {
        // void
    }

    get ready(): boolean {
        return true;
    }

    send(message: any) {
        this.websocket.send(JSON.stringify(message));
    }

    on(event: "message" | "close" | "error", listener: (data: any) => void) {
        this.websocket.on(event, listener);
    }

    stream(bytes: any) {
        ///
    }

}




