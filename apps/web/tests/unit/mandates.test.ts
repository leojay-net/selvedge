import { afterEach, describe, expect, it, vi } from "vitest";
import { MANDATE_PROGRAM_ADDRESS, decodeMandateAccount } from "@selvedge/sdk";
import { fetchProgramDeployment, mandateStatus } from "@/lib/mandates";
import {
  FIXTURE_AGENT,
  FIXTURE_MANDATE_ADDRESS,
  FIXTURE_PERIOD_CAP_BASE_UNITS,
  FIXTURE_SPENT_BASE_UNITS,
  encodeFixtureMandate,
} from "../fixtures/chainFixtures";

const NOW_SECONDS = 1_780_001_000n;

describe("mandate decoding and status", () => {
  it("decodes a fixture mandate account", () => {
    const mandate = decodeMandateAccount(FIXTURE_MANDATE_ADDRESS, encodeFixtureMandate({ revoked: false }));
    expect(mandate.agent).toBe(FIXTURE_AGENT);
    expect(mandate.periodCap).toBe(FIXTURE_PERIOD_CAP_BASE_UNITS);
    expect(mandate.spentInPeriod).toBe(FIXTURE_SPENT_BASE_UNITS);
    expect(mandate.allowedTools).toEqual([1n, 2n]);
  });

  it("reports active, revoked and expired states", () => {
    const active = decodeMandateAccount(FIXTURE_MANDATE_ADDRESS, encodeFixtureMandate({ revoked: false }));
    const revoked = decodeMandateAccount(FIXTURE_MANDATE_ADDRESS, encodeFixtureMandate({ revoked: true }));
    expect(mandateStatus(active, NOW_SECONDS)).toBe("active");
    expect(mandateStatus(revoked, NOW_SECONDS)).toBe("revoked");
    expect(mandateStatus(active, active.expiry)).toBe("expired");
  });
});

describe("live devnet program account", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the deployed mandate program from Solana devnet", async () => {
    vi.stubEnv("SOLANA_RPC_URL", "https://api.devnet.solana.com");
    const deployment = await fetchProgramDeployment();
    expect(MANDATE_PROGRAM_ADDRESS).toBe("DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd");
    expect(deployment).not.toBeNull();
    expect(deployment?.executable).toBe(true);
  });
});
