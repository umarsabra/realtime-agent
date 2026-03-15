import "dotenv/config";
import server from "./server";
import connectAri from "./server/ari";


const PORT = Number(process.env.PORT ?? 4000);


// connect ari client
connectAri().catch((err) => {
    console.error("Failed to connect to Asterisk ARI:", err);
    process.exit(1);
});



// start server
server.listen(PORT, () => {
    console.log(`Server listening on :${PORT}`);
    console.log(`Twilio webhook: http://localhost:${PORT}/twilio`);
    console.log(`Media WS path: ws://localhost:${PORT}/media`);
});


