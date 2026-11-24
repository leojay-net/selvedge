import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { decodeTransactionBytes } from "../src/decode/decodeTransaction.js";
import { TransactionParseError } from "../src/errors.js";
import { buildTransactionBytes } from "./support/transactionBuilder.js";
import * as factory from "./support/instructionFactories.js";
import { deterministicAddress } from "./support/transactionBuilder.js";

const wallet = deterministicAddress("wallet");
const friend = deterministicAddress("friend");

describe("transaction parser", () => {
  it("rejects trailing bytes", () => {
    const bytes = buildTransactionBytes({ version: "legacy", feePayer: wallet, instructions: [factory.solTransfer(wallet, friend, 5n)] });
    expect(() => decodeTransactionBytes(Uint8Array.from([...bytes, 0]))).toThrow(TransactionParseError);
  });

  it("rejects truncated bytes", () => {
    const bytes = buildTransactionBytes({ version: "legacy", feePayer: wallet, instructions: [factory.solTransfer(wallet, friend, 5n)] });
    expect(() => decodeTransactionBytes(bytes.subarray(0, bytes.length - 3))).toThrow(TransactionParseError);
  });

  it("rejects packets above the size limit", () => {
    expect(() => decodeTransactionBytes(new Uint8Array(1233))).toThrow(TransactionParseError);
  });

  it("rejects unsupported message versions", () => {
    const bytes = buildTransactionBytes({ version: 0, feePayer: wallet, instructions: [factory.solTransfer(wallet, friend, 5n)] });
    const signatureBlock = 1 + 64;
    const tampered = Uint8Array.from(bytes);
    tampered[signatureBlock] = 0x81;
    expect(() => decodeTransactionBytes(tampered)).toThrow(TransactionParseError);
  });

  it("only ever fails with a typed parse error on arbitrary bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 400 }), (bytes) => {
        try {
          decodeTransactionBytes(bytes);
        } catch (caught) {
          expect(caught).toBeInstanceOf(TransactionParseError);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("round-trips the fee payer and instruction count of generated transfers", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 1_000_000_000_000n }), fc.integer({ min: 1, max: 6 }), (lamports, instructionCount) => {
        const instructions = Array.from({ length: instructionCount }, () => factory.solTransfer(wallet, friend, lamports));
        const decoded = decodeTransactionBytes(buildTransactionBytes({ version: "legacy", feePayer: wallet, instructions }));
        expect(decoded.feePayer).toBe(wallet);
        expect(decoded.instructions).toHaveLength(instructionCount);
        expect(decoded.instructions[0]?.details.lamports).toBe(lamports.toString());
      }),
    );
  });
});
