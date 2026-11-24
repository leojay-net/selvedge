import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { z } from "zod";
import { HTTP_REQUEST_TIMEOUT_MILLISECONDS } from "../constants.js";
import { ModelProviderError, RuntimeError } from "../errors.js";
import type { SpendGate } from "../gates/spendGate.js";
import type { StudioGatewayPort } from "../tools.js";
import { STUDIO_TOOL_ID } from "../constants.js";
import type { MandatePaymentScheme } from "./mandatePaymentScheme.js";

const quoteResponseSchema = z.object({ quoteId: z.string(), totalMicroUsdc: z.number().int().nonnegative(), spec: z.unknown() });
const jobResponseSchema = z.object({ jobId: z.string() });
const settlementHeaderName = "payment-response";

export interface StudioGatewayClientConfig {
  readonly gatewayUrl: string;
  readonly network: string;
  readonly mintAddress: string;
  readonly merchantAddress: string;
  readonly paymentScheme: MandatePaymentScheme;
  readonly spendGate: SpendGate;
  readonly maximumPaymentMicroUsdc: bigint;
}

function extractSignature(response: Response): string | null {
  const header = response.headers.get(settlementHeaderName);
  if (header === null) return null;
  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as { transaction?: unknown };
    return typeof decoded.transaction === "string" ? decoded.transaction : null;
  } catch {
    return null;
  }
}

export class HttpStudioGateway implements StudioGatewayPort {
  private readonly payingFetch: typeof fetch;
  private readonly quotePrices = new Map<string, bigint>();

  constructor(private readonly config: StudioGatewayClientConfig) {
    const client = x402Client.fromConfig({
      schemes: [{ network: config.network as `${string}:${string}`, client: config.paymentScheme }],
      spendControls: {
        allowedAssets: [{ network: config.network as `${string}:${string}`, asset: config.mintAddress, maxAmountPerPayment: config.maximumPaymentMicroUsdc.toString() }],
      },
    });
    this.payingFetch = wrapFetchWithPayment(fetch, client);
  }

  async requestQuote(requestText: string): Promise<{ quoteId: string; totalMicroUsdc: number; spec: unknown }> {
    const response = await fetch(`${this.config.gatewayUrl}/studio/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: requestText }),
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MILLISECONDS),
    });
    if (!response.ok) throw new ModelProviderError("The studio gateway refused the quote request", { status: response.status });
    const quote = quoteResponseSchema.parse(await response.json());
    this.quotePrices.set(quote.quoteId, BigInt(quote.totalMicroUsdc));
    return quote;
  }

  async payForJob(quoteId: string): Promise<{ outcome: "paid"; jobId: string; signature: string } | { outcome: "refused"; rejectionCode: string; signature: string | null }> {
    const price = this.quotePrices.get(quoteId);
    if (price === undefined) throw new RuntimeError("quote_unknown", "No quote with this id was requested in this run", { quoteId });
    const attempt = { toolName: "pay_for_studio_job", payee: this.config.merchantAddress, amount: price, toolId: STUDIO_TOOL_ID };
    const refusal = await this.config.spendGate.evaluate(attempt);
    if (refusal !== null && !refusal.allowed) return { outcome: "refused", rejectionCode: refusal.reason, signature: null };

    const response = await this.payingFetch(`${this.config.gatewayUrl}/studio/quotes/${quoteId}/job`, {
      method: "POST",
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MILLISECONDS * 2),
    });
    if (response.status !== 202) {
      const rejectionCode = `GatewayStatus${response.status}`;
      this.config.spendGate.recordOnChainRefusal(attempt, rejectionCode, null);
      return { outcome: "refused", rejectionCode, signature: null };
    }
    const signature = extractSignature(response);
    if (signature === null) throw new RuntimeError("settlement_missing", "The gateway accepted the job without a settlement signature", { quoteId });
    this.config.spendGate.recordOnChainSuccess(attempt, signature);
    const job = jobResponseSchema.parse(await response.json());
    return { outcome: "paid", jobId: job.jobId, signature };
  }

  async readJob(jobId: string): Promise<unknown> {
    const response = await fetch(`${this.config.gatewayUrl}/studio/jobs/${encodeURIComponent(jobId)}`, {
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MILLISECONDS),
    });
    return response.json();
  }
}
