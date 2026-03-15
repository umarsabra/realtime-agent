export type ToolOk<T> = { status: "ok"; data: T };
export type ToolErr = { status: "error"; message: string; code?: string; details?: unknown };
export type ToolResult<T> = ToolOk<T> | ToolErr;


export type Tool = {
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
