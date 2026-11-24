import { PolicyRejection, mandatePolicy } from "@selvedge/engine";
import type { MandateAccount } from "@selvedge/sdk";
import { ChainRefusal, type MandateChain } from "../chain/mandateChain.js";
import type { ContainmentLog } from "../containmentLog.js";
import type { SpendAttempt, SpendReceipt } from "../types.js";

export interface OwnerApprovalPort {
  requestApproval(attempt: SpendAttempt): Promise<boolean>;
}

export interface SpendGateConfig {
  readonly chain: MandateChain;
  readonly log: ContainmentLog;
  readonly tokenProgramAddress: string;
  readonly approval: OwnerApprovalPort | null;
  readonly approvalThreshold: bigint;
  readonly agentAddress: string;
  readonly runEnginePrecheck: boolean;
  readonly runBudget: bigint;
  readonly nowSeconds: () => bigint;
}

export type SpendOutcome =
  | { readonly allowed: true; readonly signature: string }
  | { readonly allowed: false; readonly gate: "engine_policy" | "mandate_program" | "biometric_veto"; readonly reason: string };

function toPolicyState(account: MandateAccount): mandatePolicy.MandateState {
  return {
    owner: account.owner,
    agent: account.agent,
    securityAuthority: account.securityAuthority,
    periodCap: account.periodCap,
    periodSeconds: account.periodSeconds,
    periodStart: account.periodStart,
    spentInPeriod: account.spentInPeriod,
    expiry: account.expiry,
    revoked: account.revoked,
    nonce: account.nonce,
    allowedPrograms: account.allowedPrograms,
    allowedPayees: account.allowedPayees,
    allowedTools: account.allowedTools,
  };
}

export class SpendGate {
  private committedThisRun = 0n;

  constructor(private readonly config: SpendGateConfig) {}

  async evaluate(attempt: SpendAttempt): Promise<SpendOutcome | null> {
    const account = await this.config.chain.readMandate();
    if (this.committedThisRun + attempt.amount > this.config.runBudget) {
      this.config.log.record({ ...this.baseEvent(attempt), gate: "engine_policy", outcome: "refused", reason: "The run budget would be exceeded", rejectionCode: "RunBudgetExceeded" });
      return { allowed: false, gate: "engine_policy", reason: "RunBudgetExceeded" };
    }
    if (this.config.runEnginePrecheck) {
      const rejection = this.precheck(account, attempt);
      if (rejection !== null) {
        this.config.log.record({ ...this.baseEvent(attempt), gate: "engine_policy", outcome: "refused", reason: `Policy pre-check refused: ${rejection}`, rejectionCode: rejection });
        return { allowed: false, gate: "engine_policy", reason: rejection };
      }
    }
    if (this.config.approval !== null && attempt.amount >= this.config.approvalThreshold) {
      const approved = await this.config.approval.requestApproval(attempt);
      if (!approved) {
        this.config.log.record({ ...this.baseEvent(attempt), gate: "biometric_veto", outcome: "refused", reason: "The owner declined the biometric approval", rejectionCode: "OwnerDeclined" });
        return { allowed: false, gate: "biometric_veto", reason: "OwnerDeclined" };
      }
    }
    return null;
  }

  recordOnChainRefusal(attempt: SpendAttempt, rejectionCode: string, signature: string | null): SpendOutcome {
    this.config.log.record({
      ...this.baseEvent(attempt),
      signature,
      gate: "mandate_program",
      outcome: "refused",
      reason: `The mandate program refused: ${rejectionCode}`,
      rejectionCode,
    });
    return { allowed: false, gate: "mandate_program", reason: rejectionCode };
  }

  recordOnChainSuccess(attempt: SpendAttempt, signature: string): SpendOutcome {
    this.committedThisRun += attempt.amount;
    this.config.log.record({
      ...this.baseEvent(attempt),
      signature,
      gate: "mandate_program",
      outcome: "allowed",
      reason: "The mandate program accepted the spend",
      rejectionCode: null,
    });
    return { allowed: true, signature };
  }

  async attempt(attempt: SpendAttempt): Promise<SpendOutcome> {
    const refusal = await this.evaluate(attempt);
    if (refusal !== null) return refusal;
    const account = await this.config.chain.readMandate();
    try {
      const receipt: SpendReceipt = await this.config.chain.submitSpend(attempt, account.nonce);
      return this.recordOnChainSuccess(attempt, receipt.signature);
    } catch (caught) {
      if (!(caught instanceof ChainRefusal)) throw caught;
      return this.recordOnChainRefusal(attempt, caught.mandateErrorName ?? "UnknownProgramError", caught.signature);
    }
  }

  private baseEvent(attempt: SpendAttempt): { toolName: string; amount: string; payee: string; signature: null } {
    return { toolName: attempt.toolName, amount: attempt.amount.toString(), payee: attempt.payee, signature: null };
  }

  private precheck(account: MandateAccount, attempt: SpendAttempt): string | null {
    try {
      mandatePolicy.authorizeSpend(
        toPolicyState(account),
        {
          signer: this.config.agentAddress,
          amount: attempt.amount,
          toolId: attempt.toolId,
          program: this.config.tokenProgramAddress,
          payee: attempt.payee,
          expectedNonce: account.nonce,
        },
        this.config.nowSeconds(),
      );
      return null;
    } catch (caught) {
      if (caught instanceof PolicyRejection) return caught.rejection;
      throw caught;
    }
  }
}
