interface StreamSource {
    name: string;
    streamId: string;
    websocket: WebSocket
    clear: (streamId: string) => void;
    send: (message: any) => void;
    close: () => void;
}