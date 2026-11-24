export type GateId = "engine" | "program" | "biometric";
export type GateVerdict = "passed" | "blocked" | "skipped" | "flagged";

export interface StoryMandate {
  readonly capUsdc: number;
  readonly spentUsdc: number;
  readonly listedPayees: readonly string[];
  readonly revoked: boolean;
}

export interface Attack {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly hostile: boolean;
  readonly payee: string;
  readonly amountUsdc: number;
  readonly replaysUsedNonce: boolean;
  readonly grantsUnlimitedDelegation: boolean;
  readonly needsRevokedMandate: boolean;
}

export interface GateResult {
  readonly gate: GateId;
  readonly verdict: GateVerdict;
  readonly note: string;
}

export interface AttackOutcome {
  readonly attackId: string;
  readonly gateResults: readonly GateResult[];
  readonly settled: boolean;
  readonly stoppedBy: GateId | null;
  readonly reason: string;
}

export const SUPPLIER_PAYEE = "Supplier";
export const STRANGER_PAYEE = "Unknown wallet";
export const DEFAULT_CAP_USDC = 25;
export const MINIMUM_CAP_USDC = 5;
export const MAXIMUM_CAP_USDC = 100;
export const HONEST_PAYMENT_USDC = 2;
const OVERSPEND_MULTIPLIER = 1.6;

export const GATE_ORDER: readonly GateId[] = ["engine", "program", "biometric"];

export const GATE_TITLES: Readonly<Record<GateId, string>> = {
  engine: "Engine policy",
  program: "Mandate program",
  biometric: "Biometric veto",
};

export function buildAttacks(capUsdc: number): readonly Attack[] {
  return [
    {
      id: "honest",
      title: "Pay the supplier",
      description: "Scout buys a data feed it is allowed to buy.",
      hostile: false,
      payee: SUPPLIER_PAYEE,
      amountUsdc: HONEST_PAYMENT_USDC,
      replaysUsedNonce: false,
      grantsUnlimitedDelegation: false,
      needsRevokedMandate: false,
    },
    {
      id: "stranger",
      title: "Send funds to a stranger",
      description: "A hidden instruction on a web page tells Scout to pay an unknown wallet.",
      hostile: true,
      payee: STRANGER_PAYEE,
      amountUsdc: HONEST_PAYMENT_USDC,
      replaysUsedNonce: false,
      grantsUnlimitedDelegation: false,
      needsRevokedMandate: false,
    },
    {
      id: "overspend",
      title: "Spend past the cap",
      description: "The supplier is real, but the amount is far above the period limit.",
      hostile: true,
      payee: SUPPLIER_PAYEE,
      amountUsdc: Math.round(capUsdc * OVERSPEND_MULTIPLIER),
      replaysUsedNonce: false,
      grantsUnlimitedDelegation: false,
      needsRevokedMandate: false,
    },
    {
      id: "replay",
      title: "Replay an old payment",
      description: "Resubmit a payment that already settled, hoping it settles twice.",
      hostile: true,
      payee: SUPPLIER_PAYEE,
      amountUsdc: HONEST_PAYMENT_USDC,
      replaysUsedNonce: true,
      grantsUnlimitedDelegation: false,
      needsRevokedMandate: false,
    },
    {
      id: "delegation",
      title: "Ask for unlimited access",
      description: "A transaction quietly approves a stranger to move every token in the wallet.",
      hostile: true,
      payee: STRANGER_PAYEE,
      amountUsdc: 0,
      replaysUsedNonce: false,
      grantsUnlimitedDelegation: true,
      needsRevokedMandate: false,
    },
    {
      id: "revoked",
      title: "Pay after you pulled the plug",
      description: "You revoked the mandate. The agent tries one more payment anyway.",
      hostile: true,
      payee: SUPPLIER_PAYEE,
      amountUsdc: HONEST_PAYMENT_USDC,
      replaysUsedNonce: false,
      grantsUnlimitedDelegation: false,
      needsRevokedMandate: true,
    },
  ];
}

function programRefusal(attack: Attack, mandate: StoryMandate): string | null {
  if (mandate.revoked || attack.needsRevokedMandate) return "The mandate is revoked, so the program refuses every spend.";
  if (!mandate.listedPayees.includes(attack.payee)) return "The payee is not on the mandate allowlist.";
  if (attack.replaysUsedNonce) return "The nonce was already used, so a replay cannot settle twice.";
  if (mandate.spentUsdc + attack.amountUsdc > mandate.capUsdc) return "The spend would pass the cap for this period.";
  return null;
}

function engineRefusal(attack: Attack, mandate: StoryMandate): string | null {
  if (!attack.needsRevokedMandate && !mandate.revoked && !attack.grantsUnlimitedDelegation) {
    if (!mandate.listedPayees.includes(attack.payee)) return "The pre-check sees an unlisted payee and never builds the transaction.";
    if (mandate.spentUsdc + attack.amountUsdc > mandate.capUsdc) return "The pre-check sees the cap would be exceeded.";
  }
  return null;
}

export function runAttack(attack: Attack, mandate: StoryMandate, agentIsCompromised: boolean): AttackOutcome {
  const gateResults: GateResult[] = [];
  const engineReason = engineRefusal(attack, mandate);

  if (agentIsCompromised) {
    gateResults.push({ gate: "engine", verdict: "skipped", note: "The compromised agent skips its own pre-check." });
  } else if (engineReason !== null) {
    gateResults.push({ gate: "engine", verdict: "blocked", note: engineReason });
    return finish(attack, gateResults, "engine", engineReason);
  } else if (attack.grantsUnlimitedDelegation) {
    gateResults.push({ gate: "engine", verdict: "flagged", note: "Risk engine marks an unlimited token delegation as danger." });
  } else {
    gateResults.push({ gate: "engine", verdict: "passed", note: "Within the mandate on paper." });
  }

  if (attack.grantsUnlimitedDelegation) {
    gateResults.push({ gate: "program", verdict: "passed", note: "A raw token approval never goes through the mandate program." });
    gateResults.push({ gate: "biometric", verdict: "blocked", note: "A danger verdict needs your fingerprint. Nobody touched the sensor." });
    return finish(attack, gateResults, "biometric", "A danger verdict needs the person, and the person said no.");
  }

  const programReason = programRefusal(attack, mandate);
  if (programReason !== null) {
    gateResults.push({ gate: "program", verdict: "blocked", note: programReason });
    return finish(attack, gateResults, "program", programReason);
  }
  gateResults.push({ gate: "program", verdict: "passed", note: "Payee, amount, nonce and expiry all check out on chain." });
  gateResults.push({ gate: "biometric", verdict: "passed", note: "Nothing dangerous, so no prompt is needed." });
  return finish(attack, gateResults, null, "The payment settled inside the mandate.");
}

function finish(attack: Attack, gateResults: GateResult[], stoppedBy: GateId | null, reason: string): AttackOutcome {
  const skippedGates = GATE_ORDER.filter((gate) => !gateResults.some((result) => result.gate === gate));
  const padded = [...gateResults, ...skippedGates.map((gate): GateResult => ({ gate, verdict: "skipped", note: "Never reached." }))];
  return { attackId: attack.id, gateResults: padded, settled: stoppedBy === null, stoppedBy, reason };
}
