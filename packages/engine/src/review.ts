import { getBase64Encoder } from "@solana/kit";
import { decodeTransactionBytes, type LookupTableContents } from "./decode/decodeTransaction.js";
import { assessRisk } from "./risk/assess.js";
import { explainReview } from "./risk/explain.js";
import { simulateTransaction } from "./simulate/rpcClient.js";
import type { ReviewContext, ReviewResult, SimulationOutcome } from "./types.js";

const base64Encoder = getBase64Encoder();

export interface ReviewRequest {
  readonly transactionBase64: string;
  readonly context: ReviewContext;
  readonly rpcUrl: string | null;
  readonly lookupTables?: LookupTableContents;
  readonly fetchImplementation?: typeof fetch;
}

export async function reviewTransaction(request: ReviewRequest): Promise<ReviewResult> {
  const transactionBytes = new Uint8Array(base64Encoder.encode(request.transactionBase64));
  const decoded = decodeTransactionBytes(transactionBytes, request.lookupTables ?? {});
  let simulation: SimulationOutcome | null = null;
  if (request.rpcUrl !== null) {
    const watchedAddresses = [...new Set(decoded.resolvedAccountKeys)];
    simulation = await simulateTransaction({
      rpcUrl: request.rpcUrl,
      transactionBase64: request.transactionBase64,
      watchedAddresses,
      ...(request.fetchImplementation === undefined ? {} : { fetchImplementation: request.fetchImplementation }),
    });
  }
  const deltas = simulation?.deltas ?? [];
  const assessment = assessRisk({
    decoded,
    deltas,
    simulation: simulation === null ? null : { succeeded: simulation.succeeded, errorDescription: simulation.errorDescription },
    context: request.context,
  });
  return { decoded, simulation, assessment, explanation: explainReview(assessment, deltas, request.context) };
}
