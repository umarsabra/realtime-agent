import "dotenv/config";
import Connection from "../core/Connection";
import { WebSocket } from "ws";
import { TwilioConnection } from "../core/TwilioConnection";
import { AsteriskConnection } from "../core/AsteriskConnection";



export function getConnection(ws: WebSocket): Connection {
    if (process.env.CONNECTION_TYPE === "twilio") {
        return new TwilioConnection(ws);
    }
    return new AsteriskConnection(ws);
}



