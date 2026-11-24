import { RPC_TIMEOUT_MILLISECONDS } from "./constants";
import { serverRpcUrl } from "./env";

export class RpcRequestError extends Error {
  readonly rpcMethod: string;

  constructor(rpcMethod: string, message: string) {
    super(`RPC ${rpcMethod} failed: ${message}`);
    this.name = "RpcRequestError";
    this.rpcMethod = rpcMethod;
  }
}

interface RpcEnvelope<Result> {
  readonly result?: Result;
  readonly error?: { readonly message: string };
}

export async function callRpc<Result>(rpcMethod: string, parameters: readonly unknown[]): Promise<Result> {
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), RPC_TIMEOUT_MILLISECONDS);
  try {
    const response = await fetch(serverRpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: rpcMethod, params: parameters }),
      signal: abortController.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new RpcRequestError(rpcMethod, `HTTP ${response.status}`);
    const envelope = (await response.json()) as RpcEnvelope<Result>;
    if (envelope.error !== undefined) throw new RpcRequestError(rpcMethod, envelope.error.message);
    if (envelope.result === undefined) throw new RpcRequestError(rpcMethod, "empty result");
    return envelope.result;
  } catch (caught) {
    if (caught instanceof RpcRequestError) throw caught;
    const reason = caught instanceof Error && caught.name === "AbortError" ? "timed out" : caught instanceof Error ? caught.message : "unknown error";
    throw new RpcRequestError(rpcMethod, reason);
  } finally {
    clearTimeout(timer);
  }
}
