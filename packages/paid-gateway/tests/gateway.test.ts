import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { x402Client } from "@x402/core/client";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import { wrapFetchWithPayment } from "@x402/fetch";
import { QuoteStore, createGatewayApp, loadGatewayConfig, type StudioPort } from "../src/index.js";

const NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const MERCHANT = "CMspAw9WYXCkFiNmAv8A6divSgAeApUQgaN14SUjdUMD";
const MINT = "CcamYMVfgtUQvsmxKtz1faJqPKCGN2vtnfR6bUWWCxvQ";
const FEE_PAYER = "ExrBsPu4hhMzUde1nyWaEjUQz1XkBJKw7cr2MuFp9CGm";
const QUOTE_PRICE_MICRO_USDC = 1_250_000;

const config = loadGatewayConfig({
  FACILITATOR_KEYPAIR_PATH: "unused",
  MERCHANT_ADDRESS: MERCHANT,
  PAYMENT_ASSET_MINT: MINT,
  MANDATE_PROGRAM_ID: "DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd",
  STUDIO_INTERNAL_TOKEN: "internal-token-for-tests",
});

class FakeStudio implements StudioPort {
  readonly createdJobs: { spec: unknown; paymentReference: string; paidMicroUsdc: number }[] = [];

  async directToQuote(): Promise<{ spec: unknown; totalMicroUsdc: number }> {
    return { spec: { pages: 3 }, totalMicroUsdc: QUOTE_PRICE_MICRO_USDC };
  }

  async createPaidJob(spec: unknown, paymentReference: string, paidMicroUsdc: number): Promise<{ jobId: string }> {
    this.createdJobs.push({ spec, paymentReference, paidMicroUsdc });
    return { jobId: `job-${this.createdJobs.length}` };
  }

  async fetchJson(path: string): Promise<{ status: number; body: unknown }> {
    return { status: 200, body: { path } };
  }
}

function createFacilitator(verification: { isValid: boolean }): FacilitatorClient {
  return {
    async verify() {
      return verification.isValid ? { isValid: true, payer: "payer" } : { isValid: false, invalidReason: "invalid_exact_svm_payload" };
    },
    async settle() {
      return { success: true, transaction: "settled-signature", network: NETWORK, payer: "payer" };
    },
    async getSupported() {
      return {
        kinds: [{ x402Version: 2, scheme: "exact", network: NETWORK, extra: { feePayer: FEE_PAYER } }],
        extensions: [],
        signers: { "solana:*": [FEE_PAYER] },
      };
    },
  };
}

const fakeClientScheme: SchemeNetworkClient = {
  scheme: "exact",
  async createPaymentPayload(x402Version: number, requirements: PaymentRequirements) {
    return { x402Version, payload: { transaction: `fake-${requirements.amount}` } };
  },
};

function createTestClient(): x402Client {
  return x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: fakeClientScheme }],
    spendControls: { allowedAssets: [{ network: NETWORK, asset: MINT, maxAmountPerPayment: String(QUOTE_PRICE_MICRO_USDC) }] },
  });
}

let openServer: Server | null = null;

async function startGateway(studio: StudioPort, verification: { isValid: boolean }): Promise<string> {
  const app = createGatewayApp({ config, facilitatorClient: createFacilitator(verification), studio, quoteStore: new QuoteStore() });
  await new Promise<void>((resolve) => {
    openServer = app.listen(0, "127.0.0.1", () => resolve());
  });
  return `http://127.0.0.1:${(openServer!.address() as AddressInfo).port}`;
}

afterEach(async () => {
  const server = openServer;
  openServer = null;
  if (server !== null) await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function requestQuote(baseUrl: string): Promise<{ quoteId: string; totalMicroUsdc: number }> {
  const response = await fetch(`${baseUrl}/studio/quote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: "three page report" }),
  });
  return (await response.json()) as { quoteId: string; totalMicroUsdc: number };
}

describe("paid gateway", () => {
  it("quotes without payment and prices the job from the quote", async () => {
    const baseUrl = await startGateway(new FakeStudio(), { isValid: true });
    const quote = await requestQuote(baseUrl);
    expect(quote.totalMicroUsdc).toBe(QUOTE_PRICE_MICRO_USDC);
    const unpaid = await fetch(`${baseUrl}/studio/quotes/${quote.quoteId}/job`, { method: "POST" });
    expect(unpaid.status).toBe(402);
    const requirementsHeader = unpaid.headers.get("payment-required");
    expect(requirementsHeader).not.toBeNull();
    const decoded = JSON.parse(Buffer.from(requirementsHeader!, "base64").toString("utf8")) as { accepts: PaymentRequirements[] };
    expect(decoded.accepts[0]?.amount).toBe(String(QUOTE_PRICE_MICRO_USDC));
    expect(decoded.accepts[0]?.payTo).toBe(MERCHANT);
    expect(decoded.accepts[0]?.asset).toBe(MINT);
  });

  it("starts the studio job exactly once after a verified payment", async () => {
    const studio = new FakeStudio();
    const baseUrl = await startGateway(studio, { isValid: true });
    const quote = await requestQuote(baseUrl);
    const client = createTestClient();
    const payingFetch = wrapFetchWithPayment(fetch, client);
    const first = await payingFetch(`${baseUrl}/studio/quotes/${quote.quoteId}/job`, { method: "POST" });
    expect(first.status).toBe(202);
    const second = await payingFetch(`${baseUrl}/studio/quotes/${quote.quoteId}/job`, { method: "POST" });
    expect(second.status).toBe(202);
    expect(studio.createdJobs).toHaveLength(1);
    expect(studio.createdJobs[0]?.paidMicroUsdc).toBe(QUOTE_PRICE_MICRO_USDC);
  });

  it("never starts a job when the facilitator rejects the payment", async () => {
    const studio = new FakeStudio();
    const baseUrl = await startGateway(studio, { isValid: false });
    const quote = await requestQuote(baseUrl);
    const client = createTestClient();
    const response = await wrapFetchWithPayment(fetch, client)(`${baseUrl}/studio/quotes/${quote.quoteId}/job`, { method: "POST" });
    expect(response.status).toBe(402);
    expect(studio.createdJobs).toHaveLength(0);
  });

  it("refuses to pay a price above the client's per-payment cap", async () => {
    const studio = new FakeStudio();
    const baseUrl = await startGateway(studio, { isValid: true });
    const quote = await requestQuote(baseUrl);
    const cappedClient = x402Client.fromConfig({
      schemes: [{ network: NETWORK, client: fakeClientScheme }],
      spendControls: { allowedAssets: [{ network: NETWORK, asset: MINT, maxAmountPerPayment: "1000" }] },
    });
    await expect(wrapFetchWithPayment(fetch, cappedClient)(`${baseUrl}/studio/quotes/${quote.quoteId}/job`, { method: "POST" })).rejects.toThrow();
    expect(studio.createdJobs).toHaveLength(0);
  });

  it("rejects malformed quote requests and unknown quotes", async () => {
    const baseUrl = await startGateway(new FakeStudio(), { isValid: true });
    const malformed = await fetch(`${baseUrl}/studio/quote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ request: "", extra: true }),
    });
    expect(malformed.status).toBe(400);
    const unknown = await fetch(`${baseUrl}/studio/quotes/00000000-0000-0000-0000-000000000000/job`, { method: "POST" });
    expect([402, 404, 500]).toContain(unknown.status);
  });

  it("refuses job ids that could traverse upstream paths", async () => {
    const baseUrl = await startGateway(new FakeStudio(), { isValid: true });
    const response = await fetch(`${baseUrl}/studio/jobs/..%2Fadmin`);
    expect(response.status).toBe(400);
  });
});

describe("quote store", () => {
  it("expires quotes after their lifetime", () => {
    const store = new QuoteStore();
    const quote = store.create({}, 5, 1_000);
    expect(store.get(quote.quoteId, 1_001)).toBeDefined();
    expect(store.get(quote.quoteId, 1_000 + 11 * 60 * 1000)).toBeUndefined();
  });
});

describe("configuration", () => {
  it("fails with a readable message when required variables are missing", () => {
    expect(() => loadGatewayConfig({})).toThrow(/Invalid gateway environment/);
  });
});
