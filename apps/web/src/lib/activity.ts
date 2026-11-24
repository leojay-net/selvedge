import { getBase64Encoder } from "@solana/kit";
import { assessRisk, decodeTransactionBytes, MANDATE_PROGRAM_ID, type RiskVerdict } from "@selvedge/engine";
import { RECENT_ACTIVITY_LIMIT } from "./constants";
import { callRpc } from "./rpc";

const base64Encoder = getBase64Encoder();

interface SignatureEntry {
  readonly signature: string;
  readonly blockTime: number | null;
  readonly err: unknown;
}

interface TransactionResponse {
  readonly transaction: readonly [string, string];
}

export interface ActivityItem {
  readonly signature: string;
  readonly blockTime: number | null;
  readonly failed: boolean;
  readonly feePayer: string | null;
  readonly instructionKinds: readonly string[];
  readonly verdict: RiskVerdict | null;
  readonly score: number | null;
  readonly findingTitles: readonly string[];
}

function summarise(entry: SignatureEntry, transactionBase64: string | null): ActivityItem {
  const base = { signature: entry.signature, blockTime: entry.blockTime, failed: entry.err !== null };
  if (transactionBase64 === null) {
    return { ...base, feePayer: null, instructionKinds: [], verdict: null, score: null, findingTitles: [] };
  }
  try {
    const decoded = decodeTransactionBytes(new Uint8Array(base64Encoder.encode(transactionBase64)));
    const assessment = assessRisk({
      decoded,
      deltas: [],
      simulation: null,
      context: { walletAddresses: [decoded.feePayer], knownAddresses: [MANDATE_PROGRAM_ID], mintInfo: [] },
    });
    return {
      ...base,
      feePayer: decoded.feePayer,
      instructionKinds: decoded.instructions.map((instruction) => `${instruction.programLabel}: ${instruction.kind}`),
      verdict: assessment.verdict,
      score: assessment.score,
      findingTitles: assessment.findings.map((finding) => finding.title),
    };
  } catch {
    return { ...base, feePayer: null, instructionKinds: [], verdict: null, score: null, findingTitles: [] };
  }
}

async function fetchTransactionBase64(signature: string): Promise<string | null> {
  const response = await callRpc<TransactionResponse | null>("getTransaction", [
    signature,
    { encoding: "base64", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ]);
  return response === null ? null : response.transaction[0];
}

export async function fetchRecentMandateActivity(): Promise<ActivityItem[]> {
  const signatures = await callRpc<SignatureEntry[]>("getSignaturesForAddress", [
    MANDATE_PROGRAM_ID,
    { limit: RECENT_ACTIVITY_LIMIT, commitment: "confirmed" },
  ]);
  const items: ActivityItem[] = [];
  for (const entry of signatures) {
    items.push(summarise(entry, await fetchTransactionBase64(entry.signature)));
  }
  return items;
}
