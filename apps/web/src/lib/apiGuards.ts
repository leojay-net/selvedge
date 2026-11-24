import { NextResponse } from "next/server";
import { MAX_REQUEST_BODY_BYTES } from "./constants";
import { clientKeyFromHeaders, consumeRateLimit } from "./rateLimit";

export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
}

export function errorResponse(status: number, code: string, message: string, details?: unknown, headers?: Record<string, string>): NextResponse {
  const body: ApiErrorBody = { error: details === undefined ? { code, message } : { code, message, details } };
  return NextResponse.json(body, { status, ...(headers === undefined ? {} : { headers }) });
}

export function rateLimitFailure(request: Request): NextResponse | null {
  const decision = consumeRateLimit(clientKeyFromHeaders(request.headers));
  if (decision.allowed) return null;
  return errorResponse(429, "rate_limited", "Too many requests. Try again shortly.", undefined, {
    "retry-after": String(decision.retryAfterSeconds),
  });
}

export async function readLimitedJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; response: NextResponse }> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REQUEST_BODY_BYTES) {
    return { ok: false, response: errorResponse(413, "body_too_large", `Request bodies are limited to ${MAX_REQUEST_BODY_BYTES} bytes.`) };
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_REQUEST_BODY_BYTES) {
    return { ok: false, response: errorResponse(413, "body_too_large", `Request bodies are limited to ${MAX_REQUEST_BODY_BYTES} bytes.`) };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, response: errorResponse(400, "invalid_json", "The request body is not valid JSON.") };
  }
}
