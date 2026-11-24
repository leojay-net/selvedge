import { readFileSync, existsSync } from "node:fs";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { ContainmentEvent } from "./types.js";

const REQUEST_BODY_LIMIT = "256kb";
const RATE_LIMIT_WINDOW_MILLISECONDS = 60_000;
const RATE_LIMIT_MAXIMUM_REQUESTS = 120;
const MAXIMUM_LISTED_ENTRIES = 500;
const SHORT_ADDRESS_EDGE = 4;

export interface RuntimeAppConfig {
  readonly containmentLogPath: string;
}

function shorten(value: string): string {
  return `${value.slice(0, SHORT_ADDRESS_EDGE)}...${value.slice(-SHORT_ADDRESS_EDGE)}`;
}

const GATE_NAMES: Readonly<Record<ContainmentEvent["gate"], string>> = {
  engine_policy: "engine-policy",
  mandate_program: "mandate-program",
  biometric_veto: "biometric",
  security_agent: "security-agent",
  tool_registry: "tool-allowlist",
};

function readEvents(containmentLogPath: string): ContainmentEvent[] {
  if (!existsSync(containmentLogPath)) return [];
  return readFileSync(containmentLogPath, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ContainmentEvent);
}

function toEntry(event: ContainmentEvent): Record<string, string> {
  const gate = event.gate === "tool_registry" && event.rejectionCode === "InvalidArguments" ? "schema-validation" : GATE_NAMES[event.gate];
  const amount = event.amount === null ? "" : ` ${event.amount} micro-USDC`;
  const payee = event.payee === null ? "" : ` to ${shorten(event.payee)}`;
  return {
    id: `${event.runId}-${event.sequence}`,
    timestamp: event.recordedAt,
    agent: "Studio agent",
    attempt: `${event.toolName}${amount}${payee}`,
    gate,
    reason: event.reason,
    ...(event.signature === null ? {} : { signature: event.signature }),
  };
}

function createRateLimiter(): (request: Request, response: Response, next: NextFunction) => void {
  const windows = new Map<string, { windowStart: number; hits: number }>();
  return (request, response, next) => {
    const now = Date.now();
    const key = request.ip ?? "unknown";
    const entry = windows.get(key);
    if (entry === undefined || now - entry.windowStart > RATE_LIMIT_WINDOW_MILLISECONDS) {
      windows.set(key, { windowStart: now, hits: 1 });
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

export function createRuntimeApp(config: RuntimeAppConfig): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(createRateLimiter());
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok" });
  });

  app.get("/containment", (_request, response) => {
    const refusals = readEvents(config.containmentLogPath).filter((event) => event.outcome !== "allowed");
    response.json({ entries: refusals.slice(-MAXIMUM_LISTED_ENTRIES).reverse().map(toEntry) });
  });

  app.use((caught: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message = caught instanceof Error ? caught.message : "Unexpected error";
    response.status(500).json({ error: { code: "runtime_error", message } });
  });

  return app;
}
