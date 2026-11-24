import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactSvmScheme as ExactSvmServerScheme } from "@x402/svm/exact/server";
import type { FacilitatorClient } from "@x402/core/server";
import { z } from "zod";
import type { GatewayConfig } from "./config.js";
import { QuoteStore } from "./quoteStore.js";
import { StudioServiceError, type StudioPort } from "./studioClient.js";

const REQUEST_BODY_LIMIT = "16kb";
const RATE_LIMIT_WINDOW_MILLISECONDS = 60_000;
const RATE_LIMIT_MAXIMUM_REQUESTS = 120;
const MAXIMUM_REQUEST_TEXT_LENGTH = 2000;
const PAYMENT_TIMEOUT_SECONDS = 60;
const PAID_ROUTE_PATTERN = /^\/studio\/quotes\/([0-9a-fA-F-]{36})\/job$/;
const SAFE_PROXY_PATH_PATTERN = /^[A-Za-z0-9-]{1,64}(\/result|\/events)?$/;

const quoteRequestSchema = z.strictObject({ request: z.string().min(1).max(MAXIMUM_REQUEST_TEXT_LENGTH) });

export interface GatewayDependencies {
  readonly config: GatewayConfig;
  readonly facilitatorClient: FacilitatorClient;
  readonly studio: StudioPort;
  readonly quoteStore: QuoteStore;
}

function createRateLimiter(): (request: Request, response: Response, next: NextFunction) => void {
  const hitsByAddress = new Map<string, { windowStart: number; hits: number }>();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip ?? "unknown";
    const entry = hitsByAddress.get(key);
    if (entry === undefined || now - entry.windowStart > RATE_LIMIT_WINDOW_MILLISECONDS) {
      hitsByAddress.set(key, { windowStart: now, hits: 1 });
      next();
      return;
    }
    entry.hits += 1;
    if (entry.hits > RATE_LIMIT_MAXIMUM_REQUESTS) {
      response.status(429).json({ error: { code: "rate_limited", message: "Too many requests" } });
      return;
    }
    next();
  };
}

function errorEnvelope(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

export function createGatewayApp(dependencies: GatewayDependencies): Express {
  const { config, facilitatorClient, studio, quoteStore } = dependencies;
  const app = express();
  app.disable("x-powered-by");
  app.use(createRateLimiter());
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    config.X402_NETWORK as `${string}:${string}`,
    new ExactSvmServerScheme({ rpcUrl: config.SOLANA_RPC_URL }),
  );

  app.use(
    paymentMiddleware(
      {
        "POST /studio/quotes/*": {
          accepts: [
            {
              scheme: "exact",
              network: config.X402_NETWORK as `${string}:${string}`,
              payTo: config.MERCHANT_ADDRESS,
              maxTimeoutSeconds: PAYMENT_TIMEOUT_SECONDS,
              price: async (context) => {
                const match = PAID_ROUTE_PATTERN.exec(context.path);
                const quote = match?.[1] === undefined ? undefined : quoteStore.get(match[1]);
                if (quote === undefined) throw new Error("Unknown or expired quote");
                return { amount: String(quote.totalMicroUsdc), asset: config.PAYMENT_ASSET_MINT };
              },
            },
          ],
          description: "Render a Selvedge studio job",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.post("/studio/quote", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const parsed = quoteRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json(errorEnvelope("request_invalid", parsed.error.issues.map((issue) => issue.message).join("; ")));
        return;
      }
      const quote = await studio.directToQuote(parsed.data.request);
      const stored = quoteStore.create(quote.spec, quote.totalMicroUsdc);
      response.json({ quoteId: stored.quoteId, totalMicroUsdc: stored.totalMicroUsdc, spec: stored.spec });
    } catch (caught) {
      next(caught);
    }
  });

  app.post("/studio/quotes/:quoteId/job", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const quoteId = String(request.params.quoteId);
      const quote = quoteStore.get(quoteId);
      if (quote === undefined) {
        response.status(404).json(errorEnvelope("quote_not_found", "The quote is unknown or expired"));
        return;
      }
      if (quote.jobId === null) {
        const created = await studio.createPaidJob(quote.spec, quote.quoteId, quote.totalMicroUsdc);
        quote.jobId = created.jobId;
      }
      response.status(202).json({ jobId: quote.jobId, quoteId: quote.quoteId, paidMicroUsdc: quote.totalMicroUsdc });
    } catch (caught) {
      next(caught);
    }
  });

  app.get("/studio/jobs/:jobId", async (request: Request, response: Response, next: NextFunction) => {
    try {
      const jobId = String(request.params.jobId);
      if (!SAFE_PROXY_PATH_PATTERN.test(jobId)) {
        response.status(400).json(errorEnvelope("job_id_invalid", "The job id is malformed"));
        return;
      }
      const upstream = await studio.fetchJson(`/v1/jobs/${jobId}`);
      response.status(upstream.status).json(upstream.body);
    } catch (caught) {
      next(caught);
    }
  });

  app.use((caught: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (caught instanceof StudioServiceError) {
      response.status(caught.status >= 500 ? 502 : caught.status).json(errorEnvelope("studio_error", caught.message));
      return;
    }
    const message = caught instanceof Error ? caught.message : "Unexpected error";
    response.status(500).json(errorEnvelope("gateway_error", message));
  });

  return app;
}
