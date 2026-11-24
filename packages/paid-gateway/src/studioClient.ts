import { z } from "zod";

const STUDIO_REQUEST_TIMEOUT_MILLISECONDS = 20_000;

const quoteResponseSchema = z.object({
  spec: z.unknown(),
  quote: z.object({ specHash: z.string(), totalMicroUsdc: z.number().int().nonnegative() }).passthrough(),
});
const directResponseSchema = quoteResponseSchema;
const jobCreatedSchema = z.object({ jobId: z.string().min(1) });

export class StudioServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "StudioServiceError";
    this.status = status;
  }
}

export interface StudioQuote {
  readonly spec: unknown;
  readonly totalMicroUsdc: number;
}

export interface StudioPort {
  directToQuote(requestText: string): Promise<StudioQuote>;
  createPaidJob(spec: unknown, paymentReference: string, paidMicroUsdc: number): Promise<{ jobId: string }>;
  fetchJson(path: string): Promise<{ status: number; body: unknown }>;
}

export class HttpStudioClient implements StudioPort {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  private async request(path: string, init: RequestInit): Promise<Response> {
    const response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(STUDIO_REQUEST_TIMEOUT_MILLISECONDS),
    });
    return response;
  }

  async directToQuote(requestText: string): Promise<StudioQuote> {
    const response = await this.request("/v1/direct", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: requestText }),
    });
    if (!response.ok) throw new StudioServiceError(`Studio rejected the request: HTTP ${response.status}`, response.status);
    const parsed = directResponseSchema.parse(await response.json());
    return { spec: parsed.spec, totalMicroUsdc: parsed.quote.totalMicroUsdc };
  }

  async createPaidJob(spec: unknown, paymentReference: string, paidMicroUsdc: number): Promise<{ jobId: string }> {
    const response = await this.request("/v1/jobs", {
      method: "POST",
      headers: { "content-type": "application/json", "x-selvedge-internal-token": this.internalToken },
      body: JSON.stringify({ spec, paymentReference, paidMicroUsdc }),
    });
    if (!response.ok) throw new StudioServiceError(`Studio refused the job: HTTP ${response.status}`, response.status);
    return jobCreatedSchema.parse(await response.json());
  }

  async fetchJson(path: string): Promise<{ status: number; body: unknown }> {
    const response = await this.request(path, { method: "GET" });
    return { status: response.status, body: await response.json() };
  }
}
