import "dotenv/config";
import server from "./config/server";



const PORT = Number(process.env.PORT ?? 4000);



// start server
server.listen(PORT, () => {
    console.log(`Server listening on :${PORT}`);
    console.log(`Twilio webhook: http://localhost:${PORT}/twilio`);
    console.log(`Media WS path: ws://localhost:${PORT}/media`);
});





