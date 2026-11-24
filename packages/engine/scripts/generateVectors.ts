import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { assessRisk } from "../src/risk/assess.js";
import { explainReview } from "../src/risk/explain.js";
import { decodeTransactionBase64, type LookupTableContents } from "../src/decode/decodeTransaction.js";
import {
  DEVNET_USDC_MINT,
  MANDATE_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MAX_U64,
} from "../src/constants.js";
import type { AssetDelta, MintInfo, ReviewContext } from "../src/types.js";
import * as factory from "../tests/support/instructionFactories.js";
import {
  deterministicAddress,
  transactionBase64,
  type TransactionSpec,
} from "../tests/support/transactionBuilder.js";

const wallet = deterministicAddress("wallet");
const friend = deterministicAddress("friend");
const attacker = deterministicAddress("attacker");
const walletUsdcAccount = deterministicAddress("wallet-usdc-account");
const friendUsdcAccount = deterministicAddress("friend-usdc-account");
const attackerUsdcAccount = deterministicAddress("attacker-usdc-account");
const unknownProgram = deterministicAddress("unknown-program");
const mandateAccount = deterministicAddress("mandate-account");
const agent = deterministicAddress("agent");
const newAgent = deterministicAddress("new-agent");
const hookedMint = deterministicAddress("hooked-mint");
const lookupTable = deterministicAddress("lookup-table");
const lookedUpOne = deterministicAddress("looked-up-one");
const lookedUpTwo = deterministicAddress("looked-up-two");
const lookedUpThree = deterministicAddress("looked-up-three");
const lamports = (sol: number): bigint => BigInt(Math.round(sol * 1_000_000_000));
const usdc = (amount: number): bigint => BigInt(amount) * 1_000_000n;

const baseContext: ReviewContext = { walletAddresses: [wallet], knownAddresses: [friend, mandateAccount], mintInfo: [] };

interface DecodeCase {
  name: string;
  spec: TransactionSpec;
  lookupTables?: LookupTableContents;
  expected: { version: "legacy" | 0; kinds: string[]; details: Array<Record<string, string | number | boolean | null>> };
}

interface RiskCase {
  name: string;
  spec: TransactionSpec;
  lookupTables?: LookupTableContents;
  deltas: AssetDelta[];
  simulation: { succeeded: boolean; errorDescription: string | null } | null;
  context: ReviewContext;
  expectedRuleIds: string[];
  expectedVerdict: "safe" | "caution" | "danger";
}

function legacy(feePayer: string, ...instructions: TransactionSpec["instructions"][number][]): TransactionSpec {
  return { version: "legacy", feePayer, instructions };
}

function delta(owner: string, asset: string, before: bigint, change: bigint): AssetDelta {
  return { owner, asset, before: before.toString(), after: (before + change).toString(), change: change.toString() };
}

const decodeCases: DecodeCase[] = [
  {
    name: "legacy sol transfer",
    spec: legacy(wallet, factory.solTransfer(wallet, friend, lamports(0.25))),
    expected: { version: "legacy", kinds: ["transfer"], details: [{ lamports: lamports(0.25).toString() }] },
  },
  {
    name: "usdc transfer with compute budget",
    spec: legacy(
      wallet,
      factory.computeUnitLimit(200_000),
      factory.computeUnitPrice(1_000n),
      factory.tokenTransferChecked(TOKEN_PROGRAM_ID, walletUsdcAccount, DEVNET_USDC_MINT, friendUsdcAccount, wallet, usdc(12), 6),
    ),
    expected: {
      version: "legacy",
      kinds: ["set-compute-unit-limit", "set-compute-unit-price", "transfer-checked"],
      details: [{ units: 200_000 }, { microLamports: "1000" }, { amount: "12000000", decimals: 6 }],
    },
  },
  {
    name: "token 2022 transfer checked",
    spec: legacy(wallet, factory.tokenTransferChecked(TOKEN_2022_PROGRAM_ID, walletUsdcAccount, DEVNET_USDC_MINT, friendUsdcAccount, wallet, 5n, 6)),
    expected: { version: "legacy", kinds: ["transfer-checked"], details: [{ amount: "5", decimals: 6 }] },
  },
  {
    name: "unlimited approve",
    spec: legacy(wallet, factory.tokenApprove(walletUsdcAccount, attacker, wallet, MAX_U64)),
    expected: { version: "legacy", kinds: ["approve"], details: [{ amount: MAX_U64.toString() }] },
  },
  {
    name: "set authority account owner",
    spec: legacy(wallet, factory.tokenSetAuthority(walletUsdcAccount, wallet, 2, attacker)),
    expected: { version: "legacy", kinds: ["set-authority"], details: [{ authorityType: "account-owner", newAuthority: attacker }] },
  },
  {
    name: "close account",
    spec: legacy(wallet, factory.tokenCloseAccount(walletUsdcAccount, attacker, wallet)),
    expected: { version: "legacy", kinds: ["close-account"], details: [{}] },
  },
  {
    name: "associated token create idempotent and memo",
    spec: legacy(wallet, factory.associatedTokenCreateIdempotent(wallet, friendUsdcAccount, friend, DEVNET_USDC_MINT), factory.memo("invoice-42")),
    expected: { version: "legacy", kinds: ["create-idempotent", "memo"], details: [{}, { byteLength: 10 }] },
  },
  {
    name: "unknown program call",
    spec: legacy(wallet, factory.unknownProgramCall(unknownProgram, [walletUsdcAccount])),
    expected: { version: "legacy", kinds: ["unknown"], details: [{ dataByteLength: 3 }] },
  },
  {
    name: "system assign",
    spec: legacy(wallet, factory.systemAssign(wallet, unknownProgram)),
    expected: { version: "legacy", kinds: ["assign"], details: [{ owner: unknownProgram }] },
  },
  {
    name: "mandate spend",
    spec: legacy(agent, factory.mandateSpend(agent, mandateAccount, usdc(2), 1n, 4n)),
    expected: { version: "legacy", kinds: ["spend"], details: [{ amount: "2000000", toolId: "1", expectedNonce: "4" }] },
  },
  {
    name: "mandate revoke",
    spec: legacy(wallet, factory.mandateRevoke(wallet, mandateAccount)),
    expected: { version: "legacy", kinds: ["revoke-mandate"], details: [{}] },
  },
  {
    name: "mandate rotate agent",
    spec: legacy(wallet, factory.mandateRotateAgent(wallet, mandateAccount, newAgent)),
    expected: { version: "legacy", kinds: ["rotate-agent"], details: [{ newAgent }] },
  },
  {
    name: "v0 with unresolved lookup table",
    spec: {
      version: 0,
      feePayer: wallet,
      instructions: [factory.solTransfer(wallet, lookedUpOne, lamports(0.01))],
      lookups: [{ tableAddress: lookupTable, writableIndexes: [0], readonlyIndexes: [] }],
      lookedUpAddresses: new Set([lookedUpOne]),
    },
    expected: { version: 0, kinds: ["transfer"], details: [{ lamports: lamports(0.01).toString() }] },
  },
  {
    name: "v0 with resolved lookup table",
    spec: {
      version: 0,
      feePayer: wallet,
      instructions: [factory.solTransfer(wallet, lookedUpOne, lamports(0.01))],
      lookups: [{ tableAddress: lookupTable, writableIndexes: [0], readonlyIndexes: [] }],
      lookedUpAddresses: new Set([lookedUpOne]),
    },
    lookupTables: { [lookupTable]: [lookedUpOne] },
    expected: { version: 0, kinds: ["transfer"], details: [{ lamports: lamports(0.01).toString() }] },
  },
];

const riskCases: RiskCase[] = [
  {
    name: "small transfer to a known friend is safe",
    spec: legacy(wallet, factory.solTransfer(wallet, friend, lamports(0.01))),
    deltas: [delta(wallet, "SOL", lamports(5), -lamports(0.01)), delta(friend, "SOL", lamports(1), lamports(0.01))],
    simulation: { succeeded: true, errorDescription: null },
    context: baseContext,
    expectedRuleIds: [],
    expectedVerdict: "safe",
  },
  {
    name: "unlimited delegation is critical",
    spec: legacy(wallet, factory.tokenApprove(walletUsdcAccount, attacker, wallet, MAX_U64)),
    deltas: [],
    simulation: { succeeded: true, errorDescription: null },
    context: baseContext,
    expectedRuleIds: ["SV-001"],
    expectedVerdict: "danger",
  },
  {
    name: "limited delegation to a stranger is a warning",
    spec: legacy(wallet, factory.tokenApprove(walletUsdcAccount, attacker, wallet, usdc(10))),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-002"],
    expectedVerdict: "caution",
  },
  {
    name: "delegation to a known mandate is quiet",
    spec: legacy(wallet, factory.tokenApprove(walletUsdcAccount, mandateAccount, wallet, usdc(10))),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: [],
    expectedVerdict: "safe",
  },
  {
    name: "account owner handed to an attacker",
    spec: legacy(wallet, factory.tokenSetAuthority(walletUsdcAccount, wallet, 2, attacker)),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-003"],
    expectedVerdict: "danger",
  },
  {
    name: "close account sweeps to a stranger",
    spec: legacy(wallet, factory.tokenCloseAccount(walletUsdcAccount, attacker, wallet)),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-004"],
    expectedVerdict: "danger",
  },
  {
    name: "usdc drain of ninety five percent",
    spec: legacy(wallet, factory.tokenTransferChecked(TOKEN_PROGRAM_ID, walletUsdcAccount, DEVNET_USDC_MINT, attackerUsdcAccount, wallet, usdc(950), 6)),
    deltas: [delta(wallet, DEVNET_USDC_MINT, usdc(1000), -usdc(950)), delta(attacker, DEVNET_USDC_MINT, 0n, usdc(950))],
    simulation: { succeeded: true, errorDescription: null },
    context: baseContext,
    expectedRuleIds: ["SV-005", "SV-007"],
    expectedVerdict: "danger",
  },
  {
    name: "usdc outflow of sixty percent",
    spec: legacy(wallet, factory.tokenTransferChecked(TOKEN_PROGRAM_ID, walletUsdcAccount, DEVNET_USDC_MINT, friendUsdcAccount, wallet, usdc(600), 6)),
    deltas: [delta(wallet, DEVNET_USDC_MINT, usdc(1000), -usdc(600)), delta(friend, DEVNET_USDC_MINT, 0n, usdc(600))],
    simulation: { succeeded: true, errorDescription: null },
    context: baseContext,
    expectedRuleIds: ["SV-005"],
    expectedVerdict: "caution",
  },
  {
    name: "native dust is ignored by the drain rule",
    spec: legacy(wallet, factory.solTransfer(wallet, friend, lamports(0.004))),
    deltas: [delta(wallet, "SOL", lamports(0.005), -lamports(0.004))],
    simulation: { succeeded: true, errorDescription: null },
    context: baseContext,
    expectedRuleIds: [],
    expectedVerdict: "safe",
  },
  {
    name: "unknown program with outflow is critical",
    spec: legacy(wallet, factory.unknownProgramCall(unknownProgram, [walletUsdcAccount])),
    deltas: [delta(wallet, DEVNET_USDC_MINT, usdc(100), -usdc(5))],
    simulation: { succeeded: true, errorDescription: null },
    context: baseContext,
    expectedRuleIds: ["SV-006"],
    expectedVerdict: "danger",
  },
  {
    name: "unknown program without outflow is a warning",
    spec: legacy(wallet, factory.unknownProgramCall(unknownProgram, [walletUsdcAccount])),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-006"],
    expectedVerdict: "caution",
  },
  {
    name: "large sol transfer to a stranger",
    spec: legacy(wallet, factory.solTransfer(wallet, attacker, lamports(0.5))),
    deltas: [delta(wallet, "SOL", lamports(50), -lamports(0.5))],
    simulation: { succeeded: true, errorDescription: null },
    context: baseContext,
    expectedRuleIds: ["SV-007"],
    expectedVerdict: "caution",
  },
  {
    name: "token 2022 permanent delegate initialisation",
    spec: legacy(wallet, factory.token2022Instruction(35, [hookedMint])),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-008"],
    expectedVerdict: "danger",
  },
  {
    name: "transfer of a token with a transfer hook",
    spec: legacy(wallet, factory.tokenTransferChecked(TOKEN_2022_PROGRAM_ID, walletUsdcAccount, hookedMint, friendUsdcAccount, wallet, 10n, 6)),
    deltas: [],
    simulation: null,
    context: { ...baseContext, mintInfo: [{ mint: hookedMint, tokenProgram: TOKEN_2022_PROGRAM_ID, extensions: ["transfer-hook"] } satisfies MintInfo] },
    expectedRuleIds: ["SV-008"],
    expectedVerdict: "caution",
  },
  {
    name: "duplicate and excessive compute budget",
    spec: legacy(
      wallet,
      factory.computeUnitLimit(1_500_000),
      factory.computeUnitLimit(200_000),
      factory.computeUnitPrice(9_000_000n),
      factory.solTransfer(wallet, friend, lamports(0.001)),
    ),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-009"],
    expectedVerdict: "caution",
  },
  {
    name: "lookup tables that could not be read",
    spec: {
      version: 0,
      feePayer: wallet,
      instructions: [factory.solTransfer(wallet, lookedUpOne, lamports(0.001))],
      lookups: [{ tableAddress: lookupTable, writableIndexes: [0], readonlyIndexes: [] }],
      lookedUpAddresses: new Set([lookedUpOne]),
    },
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-010"],
    expectedVerdict: "caution",
  },
  {
    name: "most accounts come from lookup tables",
    spec: {
      version: 0,
      feePayer: wallet,
      instructions: [factory.solTransfer(wallet, lookedUpOne, lamports(0.001)), factory.solTransfer(wallet, lookedUpTwo, lamports(0.001)), factory.solTransfer(wallet, lookedUpThree, lamports(0.001))],
      lookups: [{ tableAddress: lookupTable, writableIndexes: [0, 1, 2], readonlyIndexes: [] }],
      lookedUpAddresses: new Set([lookedUpOne, lookedUpTwo, lookedUpThree]),
    },
    lookupTables: { [lookupTable]: [lookedUpOne, lookedUpTwo, lookedUpThree] },
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-010"],
    expectedVerdict: "caution",
  },
  {
    name: "wallet account assigned to another program",
    spec: legacy(wallet, factory.systemAssign(wallet, unknownProgram)),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-011"],
    expectedVerdict: "danger",
  },
  {
    name: "mandate agent rotation",
    spec: legacy(wallet, factory.mandateRotateAgent(wallet, mandateAccount, newAgent)),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-012"],
    expectedVerdict: "caution",
  },
  {
    name: "mandate revoke is informational",
    spec: legacy(wallet, factory.mandateRevoke(wallet, mandateAccount)),
    deltas: [],
    simulation: null,
    context: baseContext,
    expectedRuleIds: ["SV-012"],
    expectedVerdict: "safe",
  },
  {
    name: "simulation failure is a warning",
    spec: legacy(wallet, factory.solTransfer(wallet, friend, lamports(0.001))),
    deltas: [],
    simulation: { succeeded: false, errorDescription: "InsufficientFundsForFee" },
    context: baseContext,
    expectedRuleIds: ["SV-013"],
    expectedVerdict: "caution",
  },
];

function sortedRuleIds(ruleIds: string[]): string[] {
  return [...ruleIds].sort();
}

function writeJson(relativePath: string, document: unknown): void {
  const outputPath = fileURLToPath(new URL(relativePath, import.meta.url));
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);
}

function lookupJson(lookupTables: LookupTableContents | undefined): LookupTableContents {
  return lookupTables ?? {};
}

function generateDecodeVectors(): void {
  const cases = decodeCases.map((decodeCase) => {
    const base64 = transactionBase64(decodeCase.spec);
    const decoded = decodeTransactionBase64(base64, lookupJson(decodeCase.lookupTables));
    const kinds = decoded.instructions.map((instruction) => instruction.kind);
    if (JSON.stringify(kinds) !== JSON.stringify(decodeCase.expected.kinds) || decoded.version !== decodeCase.expected.version) {
      throw new Error(`Decode case "${decodeCase.name}" produced kinds ${JSON.stringify(kinds)}`);
    }
    decoded.instructions.forEach((instruction, instructionIndex) => {
      const expectedDetails = decodeCase.expected.details[instructionIndex] ?? {};
      for (const [detailName, detailValue] of Object.entries(expectedDetails)) {
        if (instruction.details[detailName] !== detailValue) {
          throw new Error(`Decode case "${decodeCase.name}" detail ${detailName} was ${String(instruction.details[detailName])}`);
        }
      }
    });
    return { name: decodeCase.name, transactionBase64: base64, lookupTables: lookupJson(decodeCase.lookupTables), expected: decoded };
  });
  writeJson("../../../vectors/decode/decode.v1.json", { schema: "selvedge-decode-vectors", version: 1, cases });
}

function generateRiskVectors(): void {
  const cases = riskCases.map((riskCase) => {
    const base64 = transactionBase64(riskCase.spec);
    const decoded = decodeTransactionBase64(base64, lookupJson(riskCase.lookupTables));
    const assessment = assessRisk({ decoded, deltas: riskCase.deltas, simulation: riskCase.simulation, context: riskCase.context });
    const actualRuleIds = sortedRuleIds(assessment.findings.map((finding) => finding.ruleId));
    if (JSON.stringify(actualRuleIds) !== JSON.stringify(sortedRuleIds(riskCase.expectedRuleIds)) || assessment.verdict !== riskCase.expectedVerdict) {
      throw new Error(`Risk case "${riskCase.name}" produced ${JSON.stringify(actualRuleIds)} / ${assessment.verdict}`);
    }
    return {
      name: riskCase.name,
      transactionBase64: base64,
      lookupTables: lookupJson(riskCase.lookupTables),
      deltas: riskCase.deltas,
      simulation: riskCase.simulation,
      context: riskCase.context,
      expected: {
        rulesetVersion: assessment.rulesetVersion,
        ruleIds: actualRuleIds,
        findings: assessment.findings,
        score: assessment.score,
        verdict: assessment.verdict,
        explanation: explainReview(assessment, riskCase.deltas, riskCase.context),
      },
    };
  });
  writeJson("../../../vectors/risk/risk.v1.json", { schema: "selvedge-risk-vectors", version: 1, cases });
}

const knownProgramsForReference = [MANDATE_PROGRAM_ID, SYSTEM_PROGRAM_ID, COMPUTE_BUDGET_PROGRAM_ID, MEMO_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID];
if (knownProgramsForReference.length === 0) throw new Error("unreachable");

generateDecodeVectors();
generateRiskVectors();
