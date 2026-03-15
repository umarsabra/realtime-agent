import "dotenv/config";
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-realtime";
const VAD_THRESHOLD = Number(process.env.VAD_THRESHOLD ?? 0.8);
const VAD_PREFIX_PADDING_MS = Number(process.env.VAD_PREFIX_PADDING_MS ?? 500);
const VAD_SILENCE_DURATION_MS = Number(process.env.VAD_SILENCE_DURATION_MS ?? 700);







type Tool = {
    type: string;
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            [key: string]: {
                type: string;
                description: string;
                enum?: string[];
            };
        };
        required: string[];
    };
};






