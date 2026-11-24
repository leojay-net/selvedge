import type { MandateChain } from "./chain/mandateChain.js";
import type { ContainmentLog } from "./containmentLog.js";

const HIGH_SEVERITY_REJECTIONS: ReadonlySet<string> = new Set([
  "PayeeNotAllowed",
  "ProgramNotAllowed",
  "UnauthorizedSigner",
  "ToolNotAllowed",
]);
const REFUSAL_BUDGET_BEFORE_REVOCATION = 3;

export type SecurityVerdict =
  | { readonly action: "none" }
  | { readonly action: "revoked"; readonly signature: string; readonly trigger: string };

export class SecurityAgent {
  private revoked = false;

  constructor(
    private readonly chain: MandateChain,
    private readonly log: ContainmentLog,
  ) {}

  get hasRevoked(): boolean {
    return this.revoked;
  }

  async review(): Promise<SecurityVerdict> {
    if (this.revoked) return { action: "none" };
    const refusals = this.log.all().filter((event) => event.outcome === "refused" && event.gate !== "security_agent");
    const severe = refusals.find((event) => event.rejectionCode !== null && HIGH_SEVERITY_REJECTIONS.has(event.rejectionCode));
    const trigger =
      severe !== undefined
        ? `${severe.rejectionCode} attempted through ${severe.toolName}`
        : refusals.length >= REFUSAL_BUDGET_BEFORE_REVOCATION
          ? `${refusals.length} refused actions in one run`
          : null;
    if (trigger === null) return { action: "none" };
    const receipt = await this.chain.revoke();
    this.revoked = true;
    this.log.record({
      gate: "security_agent",
      outcome: "revoked",
      toolName: "revoke_mandate",
      reason: `The security agent revoked the mandate: ${trigger}`,
      rejectionCode: null,
      signature: receipt.signature,
      amount: null,
      payee: null,
    });
    return { action: "revoked", signature: receipt.signature, trigger };
  }
}
