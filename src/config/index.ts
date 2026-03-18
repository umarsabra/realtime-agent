import "dotenv/config";
import Connection from "../core/Connection";
import { AsteriskConnection } from "../service/asterisk";
import { TwilioConnection } from "../service/twilio";
import { WebSocket } from "ws";

export function getConnection(ws: WebSocket): Connection {
    if (process.env.CONNECTION_TYPE === "twilio") {
        return new TwilioConnection(ws);
    }
    return new AsteriskConnection(ws);
}



