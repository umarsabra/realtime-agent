import "dotenv/config";
import server from "./server";
import ARIClient from "./utils/ARIClient";


const URL: string = "http://192.168.1.58:8088"
const USERNAME: string = "express"
const HOST: string = "express"
const APP: string = "realtime-ai-agent"
const PASSWORD: string = "supersecret"
const PORT = Number(process.env.PORT ?? 4000);




export const ari = ARIClient.getInstance({ url: URL, host: HOST, app: APP, username: USERNAME, password: PASSWORD });



// start server
server.listen(PORT, () => {
    console.log(`Server listening on :${PORT}`);
    console.log(`Twilio webhook: http://localhost:${PORT}/twilio`);
    console.log(`Media WS path: ws://localhost:${PORT}/media`);
});





