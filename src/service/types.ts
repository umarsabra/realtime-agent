export type FrappeResourceResponse<T> = {
    data: T;
};

export type FrappeListResponse<T> = {
    data: T[];
};

// You can expand these types as you learn your real Job/Update schema.
export type Job = Record<string, unknown> & { name?: string };
export type Update = {
    name?: string;
    job: string;
    owner: string;
    reference_doctype?: string;
    reference_name?: string;
    creation: string | Date;
    content: string;
}

export type GetJobArgs = { job_id: string };
export type EndCallArgs = { reason: string };

export type TwilioInboundEvent =
    | { event: "start"; start?: { streamSid?: string; callSid?: string; mediaFormat?: unknown } }
    | { event: "media"; media?: { payload?: string } }
    | { event: "stop" }
    | { event: string;[k: string]: unknown };

