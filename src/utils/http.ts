type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequestOptions {
    method?: HttpMethod;
    headers?: Record<string, string>;
    query?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
    timeoutMs?: number;
    retries?: number; // simple retry on network/5xx
}

function toQueryString(query: HttpRequestOptions["query"]) {
    if (!query) return "";
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        params.set(k, String(v));
    }
    const s = params.toString();
    return s ? `?${s}` : "";
}

async function sleep(ms: number) {
    await new Promise((r) => setTimeout(r, ms));
}

export async function httpJson<T>(url: string, opts: HttpRequestOptions = {}): Promise<T> {
    const {
        method = "GET",
        headers = {},
        query,
        body,
        timeoutMs = 10_000,
        retries = 1,
    } = opts;

    const fullUrl = url + toQueryString(query);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const res = await fetch(fullUrl, {
                    method,
                    headers: {
                        "Content-Type": "application/json",
                        ...headers,
                    },
                    body: body === undefined ? undefined : JSON.stringify(body),
                    signal: controller.signal,
                });

                // Retry on 5xx
                if (res.status >= 500 && res.status <= 599 && attempt < retries) {
                    await sleep(250 * (attempt + 1));
                    continue;
                }

                const text = await res.text();
                const json = text ? (JSON.parse(text) as T) : ({} as T);

                if (!res.ok) {
                    // Keep payload for debugging
                    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
                }

                return json;
            } catch (e) {
                if (attempt < retries) {
                    await sleep(250 * (attempt + 1));
                    continue;
                }
                throw e;
            }
        }

        // Unreachable
        throw new Error("Request failed after retries");
    } finally {
        clearTimeout(timer);
    }
}