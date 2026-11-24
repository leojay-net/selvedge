import { describe, expect, it } from "vitest";
import { MAX_REVIEW_BASE64_LENGTH } from "@/lib/constants";
import { addressSchema, reviewRequestSchema } from "@/lib/schemas";

describe("reviewRequestSchema", () => {
  it("accepts a minimal request and applies defaults", () => {
    const parsed = reviewRequestSchema.parse({ transactionBase64: "AQID" });
    expect(parsed.simulate).toBe(true);
    expect(parsed.walletAddresses).toEqual([]);
  });

  it("rejects non-base64 text, oversized payloads and unknown keys", () => {
    expect(reviewRequestSchema.safeParse({ transactionBase64: "not base64 !!" }).success).toBe(false);
    expect(reviewRequestSchema.safeParse({ transactionBase64: "A".repeat(MAX_REVIEW_BASE64_LENGTH + 1) }).success).toBe(false);
    expect(reviewRequestSchema.safeParse({ transactionBase64: "AQID", extra: true }).success).toBe(false);
  });

  it("rejects malformed wallet addresses", () => {
    expect(reviewRequestSchema.safeParse({ transactionBase64: "AQID", walletAddresses: ["short"] }).success).toBe(false);
  });
});

describe("addressSchema", () => {
  it("accepts base58 addresses and rejects path traversal", () => {
    expect(addressSchema.safeParse("DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd").success).toBe(true);
    expect(addressSchema.safeParse("../../etc/passwd").success).toBe(false);
  });
});
