import { httpJson } from "./http";
import type { FrappeListResponse, FrappeResourceResponse } from "../service/types";

export interface FrappeClientConfig {
    baseUrl: string; // e.g. https://app.midwestsolutions.com
    apiKey: string;
    apiSecret: string;
    timeoutMs?: number;
    retries?: number;
}

export class FrappeClient {
    constructor(private cfg: FrappeClientConfig) { }

    private get authHeader() {
        // Frappe token header format: "token API_KEY:API_SECRET"
        return { Authorization: `token ${this.cfg.apiKey}:${this.cfg.apiSecret}` };
    }




    async getDoc<T>(doctype: string, name: string, fields: string[] = ["*"]): Promise<T> {
        const url = `${this.cfg.baseUrl}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`;

        const res = await httpJson<FrappeResourceResponse<T>>(url, {
            method: "GET",
            headers: this.authHeader,
            query: { fields: JSON.stringify(fields) },
            timeoutMs: this.cfg.timeoutMs ?? 10_000,
            retries: this.cfg.retries ?? 1,
        });

        return res.data;
    }





    async list<T>(
        doctype: string,
        params: {
            filter?: unknown; // Frappe expects JSON string; we build it here
            fields?: string[];
            limit_page_length?: number;
            order_by?: string;
        } = {}
    ): Promise<T[]> {
        const url = `${this.cfg.baseUrl}/api/resource/${encodeURIComponent(doctype)}`;

        const query: Record<string, string | number | undefined> = {
            fields: JSON.stringify(params.fields ?? ["*"]),
            filter: params.filter ? JSON.stringify(params.filter) : undefined,
            limit_page_length: params.limit_page_length,
            order_by: params.order_by,
        };

        const res = await httpJson<FrappeListResponse<T>>(url, {
            method: "GET",
            headers: this.authHeader,
            query,
            timeoutMs: this.cfg.timeoutMs ?? 10_000,
            retries: this.cfg.retries ?? 1,
        });

        return res.data ?? [];
    }
}