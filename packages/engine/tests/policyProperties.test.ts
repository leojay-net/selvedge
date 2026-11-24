import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PolicyRejection } from "../src/errors.js";
import { authorizeSpend, type MandateState, type SpendRequest } from "../src/policy/mandatePolicy.js";

const OWNER = "01".repeat(32);
const AGENT = "02".repeat(32);
const TOKEN_PROGRAM = "0a".repeat(32);
const PAYEE = "14".repeat(32);
const START = 1_800_000_000n;
const DAY = 86_400n;

function freshState(periodCap: bigint): MandateState {
  return {
    owner: OWNER,
    agent: AGENT,
    securityAuthority: "03".repeat(32),
    periodCap,
    periodSeconds: DAY,
    periodStart: START,
    spentInPeriod: 0n,
    expiry: START + 400n * DAY,
    revoked: false,
    nonce: 0n,
    allowedPrograms: [TOKEN_PROGRAM],
    allowedPayees: [PAYEE],
    allowedTools: [1n],
  };
}

describe("policy properties", () => {
  it("spent in the current period never exceeds the cap for any spend sequence", () => {
    const stepArbitrary = fc.record({ amount: fc.bigInt({ min: 0n, max: 3_000_000n }), advanceSeconds: fc.bigInt({ min: 0n, max: 200_000n }) });
    fc.assert(
      fc.property(fc.bigInt({ min: 1n, max: 5_000_000n }), fc.array(stepArbitrary, { maxLength: 40 }), (periodCap, steps) => {
        let state = freshState(periodCap);
        let now = START;
        for (const step of steps) {
          now += step.advanceSeconds;
          const request: SpendRequest = {
            signer: AGENT,
            amount: step.amount,
            toolId: 1n,
            program: TOKEN_PROGRAM,
            payee: PAYEE,
            expectedNonce: state.nonce,
          };
          try {
            state = authorizeSpend(state, request, now);
          } catch (caught) {
            expect(caught).toBeInstanceOf(PolicyRejection);
          }
          expect(state.spentInPeriod).toBeLessThanOrEqual(state.periodCap);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("a revoked mandate rejects every spend", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), fc.bigInt({ min: 0n, max: 10n ** 10n }), (amount, now) => {
        const state: MandateState = { ...freshState(5_000_000n), revoked: true };
        const request: SpendRequest = { signer: AGENT, amount, toolId: 1n, program: TOKEN_PROGRAM, payee: PAYEE, expectedNonce: 0n };
        expect(() => authorizeSpend(state, request, START + now)).toThrow(PolicyRejection);
      }),
    );
  });

  it("the nonce increases by exactly one for every accepted spend", () => {
    fc.assert(
      fc.property(fc.array(fc.bigInt({ min: 1n, max: 1000n }), { maxLength: 20 }), (amounts) => {
        let state = freshState(1_000_000_000n);
        for (const amount of amounts) {
          const nonceBefore = state.nonce;
          state = authorizeSpend(
            state,
            { signer: AGENT, amount, toolId: 1n, program: TOKEN_PROGRAM, payee: PAYEE, expectedNonce: nonceBefore },
            START,
          );
          expect(state.nonce).toBe(nonceBefore + 1n);
        }
      }),
    );
  });
});
