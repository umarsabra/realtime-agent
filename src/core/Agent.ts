export type ToolSuccess<T> = { status: "ok"; data: T };
export type ToolError = { status: "error"; message: string; code?: string; details?: unknown };
export type ToolResult<T> = ToolSuccess<T> | ToolError;


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
        required?: string[];
    };
};
