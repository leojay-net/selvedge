import { beforeEach, describe, expect, it } from "vitest";
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MILLISECONDS } from "@/lib/constants";
import { clientKeyFromHeaders, consumeRateLimit, resetRateLimitsForTests } from "@/lib/rateLimit";

const START_TIME = 1_000_000;

describe("consumeRateLimit", () => {
  beforeEach(resetRateLimitsForTests);

  it("allows requests up to the limit then refuses with a retry delay", () => {
    for (let requestNumber = 0; requestNumber < RATE_LIMIT_MAX_REQUESTS; requestNumber += 1) {
      expect(consumeRateLimit("client", START_TIME).allowed).toBe(true);
    }
    const refused = consumeRateLimit("client", START_TIME);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("starts a fresh window after the window elapses", () => {
    for (let requestNumber = 0; requestNumber <= RATE_LIMIT_MAX_REQUESTS; requestNumber += 1) consumeRateLimit("client", START_TIME);
    expect(consumeRateLimit("client", START_TIME + RATE_LIMIT_WINDOW_MILLISECONDS).allowed).toBe(true);
  });

  it("tracks clients independently", () => {
    for (let requestNumber = 0; requestNumber <= RATE_LIMIT_MAX_REQUESTS; requestNumber += 1) consumeRateLimit("noisy", START_TIME);
    expect(consumeRateLimit("quiet", START_TIME).allowed).toBe(true);
  });
});

describe("clientKeyFromHeaders", () => {
  it("uses the first forwarded hop and falls back to local", () => {
    expect(clientKeyFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientKeyFromHeaders(new Headers())).toBe("local");
  });
});
