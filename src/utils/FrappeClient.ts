import { httpJson } from "./http";



export type FrappeResourceResponse<T> = {
    data: T;
};

export type FrappeListResponse<T> = {
    data: T[];
};


export interface ToolDeps {
    frappe: FrappeClient;
}



export interface FrappeClientConfig {
    baseUrl: string; // https://app.midwestsolutions.com
    apiKey: string;
    apiSecret: string;
    timeoutMs?: number;
    retries?: number;
}

export class FrappeClient {
    constructor(private cfg: FrappeClientConfig) { }

    private get authHeader() {
        // format: "token API_KEY:API_SECRET"
        return { Authorization: `token ${this.cfg.apiKey}:${this.cfg.apiSecret}` };
    }

    private resourceUrl(doctype: string, name?: string) {
        const base = `${this.cfg.baseUrl}/api/resource/${encodeURIComponent(doctype)}`;
        return name ? `${base}/${encodeURIComponent(name)}` : base;
    }




    async getDoc<T>(doctype: string, name: string, fields: string[] = ["*"]): Promise<T> {
        const url = this.resourceUrl(doctype, name);

        const res = await httpJson<FrappeResourceResponse<T>>(url, {
            method: "GET",
            headers: this.authHeader,
            query: { fields: JSON.stringify(fields) },
            timeoutMs: this.cfg.timeoutMs ?? 10_000,
            retries: this.cfg.retries ?? 1,
        });

        return res.data;
    }

    async createDoc<T>(doctype: string, values: Partial<T>): Promise<T> {
        const url = this.resourceUrl(doctype);
        const res = await httpJson<FrappeResourceResponse<T>>(url, {
            method: "POST",
            headers: this.authHeader,
            body: values,
            timeoutMs: this.cfg.timeoutMs ?? 10_000,
            retries: this.cfg.retries ?? 1,
        });
        return res.data;
    }

    async updateDoc<T>(doctype: string, name: string, values: Partial<T>): Promise<T> {
        const url = this.resourceUrl(doctype, name);

        const res = await httpJson<FrappeResourceResponse<T>>(url, {
            method: "PUT",
            headers: this.authHeader,
            body: values,
            timeoutMs: this.cfg.timeoutMs ?? 10_000,
            retries: this.cfg.retries ?? 1,
        });

        return res.data;
    }

    async deleteDoc(doctype: string, name: string): Promise<void> {
        const url = this.resourceUrl(doctype, name);

        await httpJson(url, {
            method: "DELETE",
            headers: this.authHeader,
            timeoutMs: this.cfg.timeoutMs ?? 10_000,
            retries: this.cfg.retries ?? 1,
        });
    }





    async list<T>(
        doctype: string,
        params: {
            filters?: [][];
            fields?: string[];
            limit_page_length?: number;
            order_by?: string;
        } = {}
    ): Promise<T[]> {
        const url = this.resourceUrl(doctype);

        const query: Record<string, string | number | undefined> = {
            fields: JSON.stringify(params.fields ?? ["*"]),
            filters: params.filters ? JSON.stringify(params.filters) : undefined,
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
