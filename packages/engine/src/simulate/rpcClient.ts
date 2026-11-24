import { getBase64Decoder, getBase64Encoder } from "@solana/kit";
import { SIMULATION_TIMEOUT_MILLISECONDS } from "../constants.js";
import { SimulationRpcError, SimulationTimeoutError } from "../errors.js";
import type { SimulationOutcome } from "../types.js";
import { computeAssetDeltas, type AccountSnapshot } from "./accountState.js";

const base64Encoder = getBase64Encoder();
const base64Decoder = getBase64Decoder();
const COMMITMENT = "processed";

interface RpcAccountValue {
  readonly lamports: number;
  readonly owner: string;
  readonly data: readonly [string, string];
}

interface SimulationValue {
  readonly err: unknown;
  readonly logs: readonly string[] | null;
  readonly unitsConsumed?: number;
  readonly accounts: ReadonlyArray<RpcAccountValue | null> | null;
}

interface JsonRpcEnvelope<Result> {
  readonly result?: Result;
  readonly error?: { readonly code: number; readonly message: string };
}

export interface SimulationRequest {
  readonly rpcUrl: string;
  readonly transactionBase64: string;
  readonly watchedAddresses: readonly string[];
  readonly timeoutMilliseconds?: number;
  readonly fetchImplementation?: typeof fetch;
}

async function callRpc<Result>(request: SimulationRequest, rpcMethod: string, parameters: unknown[]): Promise<Result> {
  const timeoutMilliseconds = request.timeoutMilliseconds ?? SIMULATION_TIMEOUT_MILLISECONDS;
  const fetchImplementation = request.fetchImplementation ?? fetch;
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMilliseconds);
  try {
    const response = await fetchImplementation(request.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: rpcMethod, params: parameters }),
      signal: abortController.signal,
    });
    if (!response.ok) {
      throw new SimulationRpcError(`RPC responded with HTTP ${response.status}`, { rpcMethod, status: response.status });
    }
    const envelope = (await response.json()) as JsonRpcEnvelope<Result>;
    if (envelope.error !== undefined) {
      throw new SimulationRpcError(envelope.error.message, { rpcMethod, code: envelope.error.code });
    }
    if (envelope.result === undefined) {
      throw new SimulationRpcError("RPC response had neither result nor error", { rpcMethod });
    }
    return envelope.result;
  } catch (caught) {
    if (caught instanceof SimulationRpcError) throw caught;
    if (caught instanceof Error && caught.name === "AbortError") {
      throw new SimulationTimeoutError(rpcMethod, timeoutMilliseconds);
    }
    const reason = caught instanceof Error ? caught.message : String(caught);
    throw new SimulationRpcError(`RPC request failed: ${reason}`, { rpcMethod });
  } finally {
    clearTimeout(timer);
  }
}

function toSnapshots(addresses: readonly string[], values: ReadonlyArray<RpcAccountValue | null>): AccountSnapshot[] {
  const snapshots: AccountSnapshot[] = [];
  addresses.forEach((address, addressIndex) => {
    const value = values[addressIndex];
    if (value === null || value === undefined) return;
    snapshots.push({
      address,
      lamports: BigInt(value.lamports),
      ownerProgram: value.owner,
      data: new Uint8Array(base64Encoder.encode(value.data[0])),
    });
  });
  return snapshots;
}

export async function simulateTransaction(request: SimulationRequest): Promise<SimulationOutcome> {
  const addresses = request.watchedAddresses;
  const accountParameters = { encoding: "base64", commitment: COMMITMENT };
  const preState = await callRpc<{ value: ReadonlyArray<RpcAccountValue | null> }>(request, "getMultipleAccounts", [
    addresses,
    accountParameters,
  ]);
  const simulation = await callRpc<{ value: SimulationValue }>(request, "simulateTransaction", [
    request.transactionBase64,
    {
      encoding: "base64",
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: COMMITMENT,
      accounts: { encoding: "base64", addresses },
    },
  ]);
  const value = simulation.value;
  const postValues = value.accounts ?? [];
  const deltas = computeAssetDeltas(toSnapshots(addresses, preState.value), toSnapshots(addresses, postValues));
  return {
    succeeded: value.err === null,
    errorDescription: value.err === null ? null : JSON.stringify(value.err),
    unitsConsumed: value.unitsConsumed ?? null,
    logs: value.logs ?? [],
    deltas,
  };
}

export function encodeTransactionBase64(transactionBytes: Uint8Array): string {
  return base64Decoder.decode(transactionBytes);
}
