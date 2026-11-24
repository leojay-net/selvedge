import { PolicyRejection, mandatePolicy } from "@selvedge/engine";
import type { MandateAccount } from "@selvedge/sdk";
import { ChainRefusal, type MandateChain } from "../../src/chain/mandateChain.js";
import type { SpendAttempt, SpendReceipt } from "../../src/types.js";

export const AGENT_ADDRESS = "AgentAddress1111111111111111111111111111111";
export const SECURITY_ADDRESS = "SecurityAddress11111111111111111111111111";
export const OWNER_ADDRESS = "OwnerAddress111111111111111111111111111111";
export const MERCHANT_ADDRESS = "MerchantAddress11111111111111111111111111";
export const ATTACKER_ADDRESS = "AttackerAddress1111111111111111111111111";
export const TOKEN_PROGRAM = "TokenProgram11111111111111111111111111111";
export const PERIOD_CAP = 5_000_000n;
export const STUDIO_TOOL = 1n;
export const FIXED_NOW_SECONDS = 1_800_000_000n;

export function createMandate(overrides: Partial<MandateAccount> = {}): MandateAccount {
  return {
    address: "MandateAddress11111111111111111111111111",
    version: 1,
    bump: 255,
    mandateId: 1n,
    owner: OWNER_ADDRESS,
    agent: AGENT_ADDRESS,
    securityAuthority: SECURITY_ADDRESS,
    mint: "Mint1111111111111111111111111111111111111",
    periodCap: PERIOD_CAP,
    periodSeconds: 86_400n,
    periodStart: FIXED_NOW_SECONDS - 100n,
    spentInPeriod: 0n,
    expiry: FIXED_NOW_SECONDS + 86_400n,
    revoked: false,
    nonce: 0n,
    allowedPrograms: [TOKEN_PROGRAM],
    allowedPayees: [MERCHANT_ADDRESS],
    allowedTools: [STUDIO_TOOL],
    ...overrides,
  };
}

export class MemoryChain implements MandateChain {
  revocations = 0;
  submittedSpends = 0;

  constructor(private account: MandateAccount) {}

  async readMandate(): Promise<MandateAccount> {
    return this.account;
  }

  async submitSpend(attempt: SpendAttempt, expectedNonce: bigint): Promise<SpendReceipt> {
    try {
      const next = mandatePolicy.authorizeSpend(
        this.account,
        {
          signer: AGENT_ADDRESS,
          amount: attempt.amount,
          toolId: attempt.toolId,
          program: TOKEN_PROGRAM,
          payee: attempt.payee,
          expectedNonce,
        },
        FIXED_NOW_SECONDS,
      );
      this.account = { ...this.account, ...next };
      this.submittedSpends += 1;
      return { signature: `memory-spend-${this.submittedSpends}` };
    } catch (caught) {
      if (caught instanceof PolicyRejection) throw new ChainRefusal(caught.message, caught.rejection, `memory-refused-${caught.rejection}`);
      throw caught;
    }
  }

  async revoke(): Promise<SpendReceipt> {
    this.account = { ...this.account, revoked: true };
    this.revocations += 1;
    return { signature: "memory-revoke" };
  }
}
