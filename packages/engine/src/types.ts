export type RiskSeverity = "info" | "warning" | "critical";
export type RiskVerdict = "safe" | "caution" | "danger";

export type DetailValue = string | number | boolean | null;

export interface DecodedInstruction {
  readonly programId: string;
  readonly programLabel: string;
  readonly known: boolean;
  readonly kind: string;
  readonly accounts: readonly string[];
  readonly details: Readonly<Record<string, DetailValue>>;
}

export interface AddressTableLookup {
  readonly tableAddress: string;
  readonly writableIndexes: readonly number[];
  readonly readonlyIndexes: readonly number[];
}

export interface DecodedTransaction {
  readonly version: "legacy" | 0;
  readonly signatureCount: number;
  readonly requiredSignerCount: number;
  readonly feePayer: string;
  readonly requiredSigners: readonly string[];
  readonly recentBlockhash: string;
  readonly staticAccountKeys: readonly string[];
  readonly addressTableLookups: readonly AddressTableLookup[];
  readonly lookupsResolved: boolean;
  readonly resolvedAccountKeys: readonly string[];
  readonly instructions: readonly DecodedInstruction[];
}

export interface AssetDelta {
  readonly owner: string;
  readonly asset: string;
  readonly before: string;
  readonly after: string;
  readonly change: string;
}

export interface MintInfo {
  readonly mint: string;
  readonly tokenProgram: string;
  readonly extensions: readonly string[];
}

export interface ReviewContext {
  readonly walletAddresses: readonly string[];
  readonly knownAddresses: readonly string[];
  readonly mintInfo: readonly MintInfo[];
}

export interface RiskFinding {
  readonly ruleId: string;
  readonly severity: RiskSeverity;
  readonly title: string;
  readonly detail: string;
  readonly evidence: Readonly<Record<string, DetailValue>>;
}

export interface RiskAssessment {
  readonly rulesetVersion: string;
  readonly findings: readonly RiskFinding[];
  readonly score: number;
  readonly verdict: RiskVerdict;
}

export interface SimulationOutcome {
  readonly succeeded: boolean;
  readonly errorDescription: string | null;
  readonly unitsConsumed: number | null;
  readonly logs: readonly string[];
  readonly deltas: readonly AssetDelta[];
}

export interface ReviewResult {
  readonly decoded: DecodedTransaction;
  readonly simulation: SimulationOutcome | null;
  readonly assessment: RiskAssessment;
  readonly explanation: string;
}
