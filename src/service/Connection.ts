import { WebSocket } from "ws";

export default abstract class Connection {
    public socket: WebSocket;
    private id: string | null | undefined;
    private callId: string | null | undefined;





    constructor(websocket: WebSocket, id?: string | null) {
        this.id = id
        this.socket = websocket;
        this.init();
    }




    /**
     * Initialize the connection. The implementation depends on the connection type. For example, for Twilio, it will set up WebSocket event listeners, while for Asterisk, it might send an initial command or message to establish the connection.
     */
    init() {
        console.warn("init not implemented for this connection type, using generic WebSocket event listeners");
    }


    /**
     * Check if the connection is ready.
     * @returns boolean indicating if the connection is ready
     */
    get ready() {
        return this.socket.readyState === WebSocket.OPEN && typeof this.id == "string";
    }


    /**
     * Register an event listener for the connection. The implementation depends on the connection type. For example, for Twilio, it will listen to WebSocket events, while for Asterisk, it might listen to specific events or messages from the socket.
     * @param event 
     * @param listener 
     */
    on(event: "message" | "close" | "error", listener: (data: any) => void) {
        this.socket.on(event, listener);
    }




    /**
     * Register a listener when the call starts. The implementation depends on the connection type. For example, for Twilio, it will listen to a specific "start" event from the WebSocket messages, while for Asterisk, it might listen to a specific message or command indicating the start of the call.
     * @param listener 
     */
    onStart(listener: (data: any) => void) {
        console.warn("onStart not implemented for this connection type, using generic 'message' event listener");
    }

    /**
     * Register a listener when the call stops. The implementation depends on the connection type. For example, for Twilio, it will listen to a specific "stop" event from the WebSocket messages, while for Asterisk, it might listen to a specific message or command indicating the end of the call.
     * @param listener 
     */
    onStop(listener: (data: any) => void) {
        console.warn("onStop not implemented for this connection type, using generic 'message' event listener");
    }

    /**
     * Register a listener for incoming media. The implementation depends on the connection type. For example, for Twilio, it will listen to a specific "media" event from the WebSocket messages, while for Asterisk, it might listen to specific messages or commands containing media data.
     * @param listener 
     */
    onMedia(listener: (data: Buffer) => void) {
        console.warn("onMedia not implemented for this connection type, using generic 'message' event listener");
    }

    /**
     * Register a listener for connection errors. The implementation depends on the connection type. For example, for Twilio, it will listen to WebSocket "error" events, while for Asterisk, it might listen to specific messages or commands indicating an error state.
     * @param listener 
     */
    onError(listener: (data: any) => void) {
        console.warn("onError not implemented for this connection type, using generic 'error' event listener");
    }

    onClose(listener: (data: any) => void) {
        console.warn("onClose not implemented for this connection type, using generic 'close' event listener");
    }











    /**
     * Send a message to the connection. The implementation depends on the connection type. For example, for Twilio, it will send a JSON message through the WebSocket, while for Asterisk, it might write directly to the socket or send a specific command.
     * @param message 
     */
    send(message: any) {
        this.socket.send(message);
    }




    /**
     * close the connection. The implementation depends on the connection type. For example, for Twilio, it will close the WebSocket connection, while for Asterisk, it might send a specific command or message to indicate the end of the connection before closing the socket.
     * @param code 
     * @param reason 
     */
    close(code?: number, reason?: any) {
        this.ready && this.socket.close(code, reason);
    }


    /**
     * clear the connection's media buffer or state. The implementation depends on the connection type. For example, for Twilio, it will send a JSON message to clear the stream, while for Asterisk, it might send a specific command or message to clear the media state.
     */
    clear() {
        console.warn("clear not implemented for this connection type");
    }



    /**
     * stream media bytes to the connection. The implementation depends on the connection type. For example, for Twilio, it will send a JSON message with the media payload, while for Asterisk, it might write directly to the socket.
     * @param bytes 
     */
    sendAudio(bytes: Buffer) {
        console.warn("streaming not implemented for this connection type");
    }




    // getters
    getId() {
        return this.id;
    }
    getCallId() {
        return this.callId;
    }
    getSocket() {
        return this.socket;
    }





    // setters
    setId(id?: string | null) {
        this.id = id
    }
    setCallId(callId?: string | null) {
        this.callId = callId;
    }


}




