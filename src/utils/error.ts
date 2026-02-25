export class AppError extends Error {
    constructor(
        message: string,
        public status: "error" | "ok" = "error",
        public code: string = "APP_ERROR",
        public details?: unknown
    ) {
        super(message);
        this.name = "AppError";
    }
}