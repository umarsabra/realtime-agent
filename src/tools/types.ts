export type ToolOk<T> = { status: "ok"; data: T };
export type ToolErr = { status: "error"; message: string; code?: string; details?: unknown };
export type ToolResult<T> = ToolOk<T> | ToolErr;
