import {
  MANDATE_PROGRAM_ID,
  NATIVE_ASSET,
  PERMILLE_DENOMINATOR,
  PERCENT_DENOMINATOR,
  RISK_THRESHOLDS,
  SYSTEM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../constants.js";
import { assetLabel, formatAssetAmount, shortenAddress } from "./labels.js";
import type {
  AssetDelta,
  DecodedInstruction,
  DecodedTransaction,
  DetailValue,
  ReviewContext,
  RiskFinding,
  RiskSeverity,
} from "../types.js";

export interface RuleInput {
  readonly decoded: DecodedTransaction;
  readonly deltas: readonly AssetDelta[];
  readonly simulation: { readonly succeeded: boolean; readonly errorDescription: string | null } | null;
  readonly context: ReviewContext;
}

export interface RiskRule {
  readonly ruleId: string;
  readonly slug: string;
  readonly evaluate: (input: RuleInput) => readonly RiskFinding[];
}

const TOKEN_PROGRAMS: readonly string[] = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];
const APPROVAL_KINDS: readonly string[] = ["approve", "approve-checked"];
const TOKEN_TRANSFER_KINDS: readonly string[] = ["transfer", "transfer-checked"];
const MANDATE_CHANGE_KINDS: readonly string[] = ["update-limits", "rotate-agent", "close-mandate"];
const ASSIGN_KINDS: readonly string[] = ["assign", "assign-with-seed"];
const HAZARD_EXTENSION_KINDS: Readonly<Record<string, { severity: RiskSeverity; description: string }>> = {
  "initialize-permanent-delegate": {
    severity: "critical",
    description: "gives a permanent delegate the power to move or burn any holder's tokens",
  },
  "transfer-hook-extension": {
    severity: "warning",
    description: "runs another program on every transfer of this token",
  },
  "confidential-transfer-extension": {
    severity: "warning",
    description: "hides transfer amounts, so the review cannot show them",
  },
};
const MINT_EXTENSION_HAZARDS: Readonly<Record<string, { severity: RiskSeverity; description: string }>> = {
  "permanent-delegate": HAZARD_EXTENSION_KINDS["initialize-permanent-delegate"]!,
  "transfer-hook": HAZARD_EXTENSION_KINDS["transfer-hook-extension"]!,
  "confidential-transfer": HAZARD_EXTENSION_KINDS["confidential-transfer-extension"]!,
};

function isTrustedAddress(address: string, context: ReviewContext): boolean {
  return context.walletAddresses.includes(address) || context.knownAddresses.includes(address);
}

function isWalletAddress(address: string, context: ReviewContext): boolean {
  return context.walletAddresses.includes(address);
}

function tokenInstructions(decoded: DecodedTransaction): DecodedInstruction[] {
  return decoded.instructions.filter((instruction) => TOKEN_PROGRAMS.includes(instruction.programId));
}

function finding(
  ruleId: string,
  severity: RiskSeverity,
  title: string,
  detail: string,
  evidence: Record<string, DetailValue>,
): RiskFinding {
  return { ruleId, severity, title, detail, evidence };
}

function parseUnits(value: DetailValue | undefined): bigint {
  return typeof value === "string" ? BigInt(value) : 0n;
}

function walletTokenOutflow(deltas: readonly AssetDelta[], context: ReviewContext): boolean {
  return deltas.some(
    (delta) => isWalletAddress(delta.owner, context) && BigInt(delta.change) < 0n && delta.asset !== NATIVE_ASSET,
  );
}

const unlimitedDelegation: RiskRule = {
  ruleId: "SV-001",
  slug: "unlimited-token-delegation",
  evaluate: ({ decoded, context }) => {
    const findings: RiskFinding[] = [];
    for (const instruction of tokenInstructions(decoded)) {
      if (!APPROVAL_KINDS.includes(instruction.kind)) continue;
      const amount = parseUnits(instruction.details.amount);
      const delegate = instruction.kind === "approve" ? instruction.accounts[1] : instruction.accounts[2];
      if (delegate === undefined) continue;
      if (amount >= RISK_THRESHOLDS.unlimitedApprovalMinimumAmount) {
        findings.push(
          finding(
            "SV-001",
            "critical",
            "Unlimited token delegation",
            `This lets ${delegate} spend an effectively unlimited amount of your tokens at any time.`,
            { delegate, amount: amount.toString() },
          ),
        );
      } else if (!isTrustedAddress(delegate, context)) {
        findings.push(
          finding(
            "SV-002",
            "warning",
            "Token delegation to an unfamiliar address",
            `This lets ${delegate} spend up to ${amount.toString()} token units from your account.`,
            { delegate, amount: amount.toString() },
          ),
        );
      }
    }
    return findings;
  },
};

const authorityChange: RiskRule = {
  ruleId: "SV-003",
  slug: "authority-change",
  evaluate: ({ decoded, context }) => {
    const findings: RiskFinding[] = [];
    for (const instruction of tokenInstructions(decoded)) {
      if (instruction.kind !== "set-authority") continue;
      const newAuthority = instruction.details.newAuthority;
      const target = instruction.accounts[0] ?? "unknown";
      const keepsControl = typeof newAuthority === "string" && isWalletAddress(newAuthority, context);
      if (keepsControl) continue;
      findings.push(
        finding(
          "SV-003",
          "critical",
          "Control of a token account or mint is being handed over",
          `The ${String(instruction.details.authorityType)} authority of ${target} would move to ${
            typeof newAuthority === "string" ? newAuthority : "no one"
          }.`,
          {
            account: target,
            authorityType: instruction.details.authorityType ?? null,
            newAuthority: typeof newAuthority === "string" ? newAuthority : null,
          },
        ),
      );
    }
    return findings;
  },
};

const closeAccountSweep: RiskRule = {
  ruleId: "SV-004",
  slug: "close-account-sweep",
  evaluate: ({ decoded, context }) => {
    const findings: RiskFinding[] = [];
    for (const instruction of tokenInstructions(decoded)) {
      if (instruction.kind !== "close-account") continue;
      const destination = instruction.accounts[1];
      if (destination === undefined || isTrustedAddress(destination, context)) continue;
      findings.push(
        finding(
          "SV-004",
          "critical",
          "Account is closed and its balance sent elsewhere",
          `Closing ${instruction.accounts[0] ?? "an account"} would send its remaining lamports to ${destination}.`,
          { account: instruction.accounts[0] ?? null, destination },
        ),
      );
    }
    return findings;
  },
};

const balanceDrain: RiskRule = {
  ruleId: "SV-005",
  slug: "balance-drain",
  evaluate: ({ deltas, context }) => {
    const findings: RiskFinding[] = [];
    for (const delta of deltas) {
      if (!isWalletAddress(delta.owner, context)) continue;
      const before = BigInt(delta.before);
      const change = BigInt(delta.change);
      if (change >= 0n || before <= 0n) continue;
      if (delta.asset === NATIVE_ASSET && before < RISK_THRESHOLDS.drainIgnoredNativeLamports) continue;
      const lostPermille = (-change * PERMILLE_DENOMINATOR) / before;
      if (lostPermille >= RISK_THRESHOLDS.criticalDrainPermille) {
        findings.push(
          finding(
            "SV-005",
            "critical",
            "Nearly your entire balance leaves",
            `About ${(lostPermille / 10n).toString()}% of your ${assetLabel(delta.asset)} balance would leave your wallet.`,
            { owner: delta.owner, asset: delta.asset, lostPermille: lostPermille.toString() },
          ),
        );
      } else if (lostPermille >= RISK_THRESHOLDS.warningDrainPermille) {
        findings.push(
          finding(
            "SV-005",
            "warning",
            "More than half of a balance leaves",
            `About ${(lostPermille / 10n).toString()}% of your ${assetLabel(delta.asset)} balance would leave your wallet.`,
            { owner: delta.owner, asset: delta.asset, lostPermille: lostPermille.toString() },
          ),
        );
      }
    }
    return findings;
  },
};

const unknownProgram: RiskRule = {
  ruleId: "SV-006",
  slug: "unknown-program",
  evaluate: ({ decoded, deltas, context }) => {
    const unknownPrograms = decoded.instructions
      .filter((instruction) => !instruction.known)
      .map((instruction) => instruction.programId);
    if (unknownPrograms.length === 0) return [];
    const uniquePrograms = [...new Set(unknownPrograms)];
    const hasOutflow = deltas.some((delta) => isWalletAddress(delta.owner, context) && BigInt(delta.change) < 0n);
    return [
      finding(
        "SV-006",
        hasOutflow ? "critical" : "warning",
        "Calls a program Selvedge does not recognise",
        `The transaction runs ${uniquePrograms.join(", ")}, which cannot be decoded${
          hasOutflow ? " and it reduces your balance" : ""
        }.`,
        { programs: uniquePrograms.join(","), withOutflow: hasOutflow },
      ),
    ];
  },
};

const newRecipientTransfer: RiskRule = {
  ruleId: "SV-007",
  slug: "new-recipient-large-transfer",
  evaluate: ({ decoded, deltas, context }) => {
    const findings: RiskFinding[] = [];
    for (const instruction of decoded.instructions) {
      if (instruction.programId !== SYSTEM_PROGRAM_ID || instruction.kind !== "transfer") continue;
      const lamports = parseUnits(instruction.details.lamports);
      const destination = instruction.accounts[1];
      if (destination === undefined || isTrustedAddress(destination, context)) continue;
      if (lamports >= RISK_THRESHOLDS.newRecipientWarningLamports) {
        findings.push(
          finding(
            "SV-007",
            "warning",
            "Large transfer to an address you have not used",
            `${lamports.toString()} lamports would go to ${destination}.`,
            { destination, asset: NATIVE_ASSET, amount: lamports.toString() },
          ),
        );
      }
    }
    for (const delta of deltas) {
      if (delta.asset === NATIVE_ASSET || isTrustedAddress(delta.owner, context)) continue;
      const gained = BigInt(delta.change);
      if (gained >= RISK_THRESHOLDS.newRecipientWarningTokenUnits && walletTokenOutflow(deltas, context)) {
        findings.push(
          finding(
            "SV-007",
            "warning",
            "Large transfer to an address you have not used",
            `${formatAssetAmount(delta.asset, gained)} would go to ${shortenAddress(delta.owner)}.`,
            { destination: delta.owner, asset: delta.asset, amount: gained.toString() },
          ),
        );
      }
    }
    return findings;
  },
};

const token2022Hazards: RiskRule = {
  ruleId: "SV-008",
  slug: "token-2022-extension-hazard",
  evaluate: ({ decoded, context }) => {
    const findings: RiskFinding[] = [];
    for (const instruction of decoded.instructions) {
      const hazard = HAZARD_EXTENSION_KINDS[instruction.kind];
      if (instruction.programId !== TOKEN_2022_PROGRAM_ID || hazard === undefined) continue;
      findings.push(
        finding("SV-008", hazard.severity, "Risky Token-2022 extension", `This instruction ${hazard.description}.`, {
          kind: instruction.kind,
        }),
      );
    }
    for (const instruction of tokenInstructions(decoded)) {
      if (instruction.kind !== "transfer-checked") continue;
      const mint = instruction.accounts[1];
      const info = context.mintInfo.find((candidate) => candidate.mint === mint);
      if (info === undefined) continue;
      for (const extension of info.extensions) {
        const hazard = MINT_EXTENSION_HAZARDS[extension];
        if (hazard === undefined) continue;
        findings.push(
          finding("SV-008", hazard.severity, "Token has a risky extension", `Token ${info.mint} ${hazard.description}.`, {
            mint: info.mint,
            extension,
          }),
        );
      }
    }
    return findings;
  },
};

const computeBudgetAnomaly: RiskRule = {
  ruleId: "SV-009",
  slug: "compute-budget-anomaly",
  evaluate: ({ decoded }) => {
    const anomalies: string[] = [];
    const limits = decoded.instructions.filter((instruction) => instruction.kind === "set-compute-unit-limit");
    const prices = decoded.instructions.filter((instruction) => instruction.kind === "set-compute-unit-price");
    if (limits.length > 1 || prices.length > 1) {
      anomalies.push("the compute budget is set more than once");
    }
    for (const priceInstruction of prices) {
      if (parseUnits(priceInstruction.details.microLamports) > RISK_THRESHOLDS.maximumComputeUnitPriceMicroLamports) {
        anomalies.push("the priority fee price is far above normal levels");
      }
    }
    for (const limitInstruction of limits) {
      if (Number(limitInstruction.details.units ?? 0) > RISK_THRESHOLDS.maximumComputeUnitLimit) {
        anomalies.push("the compute limit exceeds what the network allows");
      }
    }
    if (anomalies.length === 0) return [];
    return [
      finding("SV-009", "warning", "Unusual compute budget", `In this transaction ${anomalies.join(", and ")}.`, {
        anomalyCount: anomalies.length,
      }),
    ];
  },
};

const lookupTableObfuscation: RiskRule = {
  ruleId: "SV-010",
  slug: "lookup-table-obfuscation",
  evaluate: ({ decoded }) => {
    if (decoded.addressTableLookups.length === 0) return [];
    if (!decoded.lookupsResolved) {
      return [
        finding(
          "SV-010",
          "warning",
          "Some accounts are hidden behind lookup tables",
          "The lookup tables could not be read, so part of this transaction cannot be reviewed.",
          { tables: decoded.addressTableLookups.map((lookup) => lookup.tableAddress).join(",") },
        ),
      ];
    }
    const lookedUpCount = decoded.resolvedAccountKeys.length - decoded.staticAccountKeys.length;
    const sharePercent = Math.floor((lookedUpCount * PERCENT_DENOMINATOR) / decoded.resolvedAccountKeys.length);
    if (sharePercent > RISK_THRESHOLDS.maximumLookupTableSharePercent) {
      return [
        finding(
          "SV-010",
          "warning",
          "Most accounts come from lookup tables",
          "Most of the accounts in this transaction are not written in the transaction itself.",
          { lookedUpCount, sharePercent },
        ),
      ];
    }
    return [];
  },
};

const accountAssignment: RiskRule = {
  ruleId: "SV-011",
  slug: "account-assignment",
  evaluate: ({ decoded, context }) => {
    const findings: RiskFinding[] = [];
    for (const instruction of decoded.instructions) {
      if (instruction.programId !== SYSTEM_PROGRAM_ID || !ASSIGN_KINDS.includes(instruction.kind)) continue;
      const newOwner = instruction.details.owner;
      const account = instruction.accounts[0];
      if (typeof newOwner !== "string" || newOwner === SYSTEM_PROGRAM_ID || account === undefined) continue;
      if (!isWalletAddress(account, context)) continue;
      findings.push(
        finding(
          "SV-011",
          "critical",
          "Your wallet account is handed to another program",
          `Assigning ${account} to ${newOwner} lets that program take control of the account.`,
          { account, newOwner },
        ),
      );
    }
    return findings;
  },
};

const mandateChange: RiskRule = {
  ruleId: "SV-012",
  slug: "mandate-change",
  evaluate: ({ decoded }) => {
    const findings: RiskFinding[] = [];
    for (const instruction of decoded.instructions) {
      if (instruction.programId !== MANDATE_PROGRAM_ID) continue;
      if (MANDATE_CHANGE_KINDS.includes(instruction.kind)) {
        findings.push(
          finding(
            "SV-012",
            "warning",
            "Changes an agent mandate",
            `This ${instruction.kind.replace("-", " ")} changes what an agent is allowed to do with your funds.`,
            { kind: instruction.kind },
          ),
        );
      } else if (instruction.kind === "revoke-mandate") {
        findings.push(
          finding("SV-012", "info", "Revokes an agent mandate", "The agent loses all spending authority.", {
            kind: instruction.kind,
          }),
        );
      }
    }
    return findings;
  },
};

const simulationFailed: RiskRule = {
  ruleId: "SV-013",
  slug: "simulation-failed",
  evaluate: ({ simulation }) => {
    if (simulation === null || simulation.succeeded) return [];
    return [
      finding(
        "SV-013",
        "warning",
        "The transaction fails in simulation",
        `Simulation reported: ${simulation.errorDescription ?? "unknown error"}.`,
        { error: simulation.errorDescription },
      ),
    ];
  },
};

export const RISK_RULES: readonly RiskRule[] = [
  unlimitedDelegation,
  authorityChange,
  closeAccountSweep,
  balanceDrain,
  unknownProgram,
  newRecipientTransfer,
  token2022Hazards,
  computeBudgetAnomaly,
  lookupTableObfuscation,
  accountAssignment,
  mandateChange,
  simulationFailed,
];
