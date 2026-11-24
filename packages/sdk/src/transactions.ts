import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { extractMandateErrorName } from "./errors.js";

const CONFIRMATION_POLL_INTERVAL_MILLISECONDS = 1_500;
const RATE_LIMIT_MAXIMUM_ATTEMPTS = 8;
const RATE_LIMIT_BASE_DELAY_MILLISECONDS = 1_000;
const RATE_LIMIT_MARKER = "429";
const CONFIRMATION_TIMEOUT_MILLISECONDS = 60_000;
const SEND_COMMITMENT = "confirmed" as const;

export type SolanaRpc = ReturnType<typeof createSolanaRpc>;

export class TransactionFailedError extends Error {
  readonly signature: string | null;
  readonly mandateErrorName: string | null;

  constructor(message: string, signature: string | null) {
    super(message);
    this.name = "TransactionFailedError";
    this.signature = signature;
    this.mandateErrorName = extractMandateErrorName(message);
  }
}

export interface SendRequest {
  readonly rpc: SolanaRpc;
  readonly feePayer: TransactionSigner;
  readonly instructions: readonly Instruction[];
  readonly skipPreflight?: boolean;
}

export async function withRateLimitRetry<Result>(operation: () => Promise<Result>): Promise<Result> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (caught) {
      const isRateLimited = caught instanceof Error && caught.message.includes(RATE_LIMIT_MARKER);
      if (!isRateLimited || attempt >= RATE_LIMIT_MAXIMUM_ATTEMPTS) throw caught;
      await sleep(RATE_LIMIT_BASE_DELAY_MILLISECONDS * 2 ** (attempt - 1));
    }
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function buildSignedTransaction(request: SendRequest): Promise<{ base64: string; signature: string }> {
  const { value: latestBlockhash } = await withRateLimitRetry(() =>
    request.rpc.getLatestBlockhash({ commitment: SEND_COMMITMENT }).send(),
  );
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (partialMessage) => setTransactionMessageFeePayerSigner(request.feePayer, partialMessage),
    (partialMessage) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, partialMessage),
    (partialMessage) => appendTransactionMessageInstructions([...request.instructions], partialMessage),
  );
  const signedTransaction = await signTransactionMessageWithSigners(message);
  return {
    base64: getBase64EncodedWireTransaction(signedTransaction),
    signature: getSignatureFromTransaction(signedTransaction),
  };
}

async function waitForConfirmation(rpc: SolanaRpc, signature: string): Promise<void> {
  const deadline = Date.now() + CONFIRMATION_TIMEOUT_MILLISECONDS;
  while (Date.now() < deadline) {
    const { value } = await withRateLimitRetry(() =>
      rpc.getSignatureStatuses([signature as never], { searchTransactionHistory: true }).send(),
    );
    const status = value[0];
    if (status !== null && status !== undefined) {
      if (status.err !== null) {
        throw new TransactionFailedError(`Transaction ${signature} failed on chain: ${JSON.stringify(status.err, bigintReplacer)}`, signature);
      }
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
    }
    await sleep(CONFIRMATION_POLL_INTERVAL_MILLISECONDS);
  }
  throw new TransactionFailedError(`Transaction ${signature} was not confirmed in time`, signature);
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export async function sendAndConfirm(request: SendRequest): Promise<string> {
  const { base64, signature } = await buildSignedTransaction(request);
  try {
    await withRateLimitRetry(() =>
      request.rpc
        .sendTransaction(base64 as never, {
          encoding: "base64",
          preflightCommitment: SEND_COMMITMENT,
          skipPreflight: request.skipPreflight ?? false,
        })
        .send(),
    );
  } catch (caught) {
    const reason = caught instanceof Error ? `${caught.message} ${JSON.stringify((caught as { context?: unknown }).context ?? {}, bigintReplacer)}` : String(caught);
    throw new TransactionFailedError(`Transaction rejected before confirmation: ${reason}`, null);
  }
  await waitForConfirmation(request.rpc, signature);
  return signature;
}
