import {
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_MAX_TRACKED_CLIENTS,
  RATE_LIMIT_WINDOW_MILLISECONDS,
} from "./constants";

interface ClientWindow {
  windowStart: number;
  requestCount: number;
}

const clientWindows = new Map<string, ClientWindow>();

function evictExpiredWindows(now: number): void {
  for (const [clientKey, clientWindow] of clientWindows) {
    if (now - clientWindow.windowStart >= RATE_LIMIT_WINDOW_MILLISECONDS) clientWindows.delete(clientKey);
  }
}

export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const firstHop = forwarded?.split(",")[0]?.trim();
  return firstHop !== undefined && firstHop.length > 0 ? firstHop : "local";
}

export function consumeRateLimit(clientKey: string, now: number = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  if (clientWindows.size >= RATE_LIMIT_MAX_TRACKED_CLIENTS) evictExpiredWindows(now);
  const existing = clientWindows.get(clientKey);
  if (existing === undefined || now - existing.windowStart >= RATE_LIMIT_WINDOW_MILLISECONDS) {
    clientWindows.set(clientKey, { windowStart: now, requestCount: 1 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  existing.requestCount += 1;
  if (existing.requestCount > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMilliseconds = RATE_LIMIT_WINDOW_MILLISECONDS - (now - existing.windowStart);
    return { allowed: false, retryAfterSeconds: Math.ceil(retryAfterMilliseconds / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitsForTests(): void {
  clientWindows.clear();
}
