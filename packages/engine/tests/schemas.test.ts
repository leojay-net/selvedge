import { describe, expect, it } from "vitest";
import { exportIntentJsonSchema, intentSchema } from "../src/schemas/intents.js";

const VALID_ADDRESS = "DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd";

describe("intent schemas", () => {
  it("accepts a well-formed transfer", () => {
    const parsed = intentSchema.safeParse({ version: 1, kind: "transfer", asset: "SOL", recipient: VALID_ADDRESS, amount: "1000" });
    expect(parsed.success).toBe(true);
  });

  it("rejects zero, negative, fractional and oversized amounts", () => {
    for (const amount of ["0", "-5", "1.5", "18446744073709551616", "abc"]) {
      const parsed = intentSchema.safeParse({ version: 1, kind: "transfer", asset: "SOL", recipient: VALID_ADDRESS, amount });
      expect(parsed.success, amount).toBe(false);
    }
  });

  it("rejects unknown fields so a model cannot smuggle extra instructions", () => {
    const parsed = intentSchema.safeParse({
      version: 1,
      kind: "transfer",
      asset: "SOL",
      recipient: VALID_ADDRESS,
      amount: "5",
      rawTransaction: "AAAA",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects malformed recipients and unknown kinds", () => {
    expect(intentSchema.safeParse({ version: 1, kind: "transfer", asset: "SOL", recipient: "not-an-address", amount: "5" }).success).toBe(false);
    expect(intentSchema.safeParse({ version: 1, kind: "execute-shell", command: "rm -rf /" }).success).toBe(false);
  });

  it("exports a JSON schema", () => {
    const schema = exportIntentJsonSchema() as { anyOf?: unknown[] };
    expect(Array.isArray(schema.anyOf)).toBe(true);
  });
});
