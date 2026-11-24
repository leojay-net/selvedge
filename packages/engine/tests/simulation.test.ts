import { describe, expect, it } from "vitest";
import { getAddressEncoder, getBase64Decoder } from "@solana/kit";
import { DEVNET_USDC_MINT, TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID } from "../src/constants.js";
import { SimulationRpcError, SimulationTimeoutError } from "../src/errors.js";
import { computeAssetDeltas, type AccountSnapshot } from "../src/simulate/accountState.js";
import { simulateTransaction } from "../src/simulate/rpcClient.js";
import { deterministicAddress, littleEndian } from "./support/transactionBuilder.js";

const addressEncoder = getAddressEncoder();
const base64Decoder = getBase64Decoder();
const owner = deterministicAddress("wallet");
const tokenAccount = deterministicAddress("wallet-usdc-account");

function tokenAccountSnapshot(amount: bigint): AccountSnapshot {
  const data = new Uint8Array(165);
  data.set(addressEncoder.encode(DEVNET_USDC_MINT as never), 0);
  data.set(addressEncoder.encode(owner as never), 32);
  data.set(littleEndian(amount, 8), 64);
  return { address: tokenAccount, lamports: 2_039_280n, ownerProgram: TOKEN_PROGRAM_ID, data };
}

function systemSnapshot(lamports: bigint): AccountSnapshot {
  return { address: owner, lamports, ownerProgram: SYSTEM_PROGRAM_ID, data: new Uint8Array(0) };
}

function rpcAccount(snapshot: AccountSnapshot): unknown {
  return { lamports: Number(snapshot.lamports), owner: snapshot.ownerProgram, data: [base64Decoder.decode(snapshot.data), "base64"] };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("asset deltas", () => {
  it("reports token and native changes by owner and mint", () => {
    const deltas = computeAssetDeltas(
      [tokenAccountSnapshot(1_000_000n), systemSnapshot(5_000_000_000n)],
      [tokenAccountSnapshot(400_000n), systemSnapshot(4_999_995_000n)],
    );
    expect(deltas).toEqual([
      { owner, asset: DEVNET_USDC_MINT, before: "1000000", after: "400000", change: "-600000" },
      { owner, asset: "SOL", before: "5000000000", after: "4999995000", change: "-5000" },
    ].sort((first, second) => `${first.owner}|${first.asset}`.localeCompare(`${second.owner}|${second.asset}`)));
  });

  it("ignores unchanged accounts", () => {
    expect(computeAssetDeltas([tokenAccountSnapshot(5n)], [tokenAccountSnapshot(5n)])).toEqual([]);
  });
});

describe("simulation client", () => {
  it("combines pre and post state into deltas", async () => {
    let callIndex = 0;
    const fakeFetch: typeof fetch = async () => {
      callIndex += 1;
      if (callIndex === 1) {
        return jsonResponse({ result: { value: [rpcAccount(tokenAccountSnapshot(900n))] } });
      }
      return jsonResponse({
        result: { value: { err: null, logs: ["Program log: ok"], unitsConsumed: 1234, accounts: [rpcAccount(tokenAccountSnapshot(100n))] } },
      });
    };
    const outcome = await simulateTransaction({
      rpcUrl: "http://rpc.test",
      transactionBase64: "AA==",
      watchedAddresses: [tokenAccount],
      fetchImplementation: fakeFetch,
    });
    expect(outcome.succeeded).toBe(true);
    expect(outcome.unitsConsumed).toBe(1234);
    expect(outcome.deltas).toEqual([{ owner, asset: DEVNET_USDC_MINT, before: "900", after: "100", change: "-800" }]);
  });

  it("reports an on-chain failure without throwing", async () => {
    let callIndex = 0;
    const fakeFetch: typeof fetch = async () => {
      callIndex += 1;
      if (callIndex === 1) return jsonResponse({ result: { value: [null] } });
      return jsonResponse({ result: { value: { err: { InstructionError: [0, "Custom"] }, logs: null, accounts: null } } });
    };
    const outcome = await simulateTransaction({
      rpcUrl: "http://rpc.test",
      transactionBase64: "AA==",
      watchedAddresses: [tokenAccount],
      fetchImplementation: fakeFetch,
    });
    expect(outcome.succeeded).toBe(false);
    expect(outcome.errorDescription).toContain("InstructionError");
  });

  it("raises a typed error for HTTP failures and RPC errors", async () => {
    const httpFailure: typeof fetch = async () => jsonResponse({}, 503);
    await expect(
      simulateTransaction({ rpcUrl: "http://rpc.test", transactionBase64: "AA==", watchedAddresses: [], fetchImplementation: httpFailure }),
    ).rejects.toBeInstanceOf(SimulationRpcError);
    const rpcFailure: typeof fetch = async () => jsonResponse({ error: { code: -32002, message: "blockhash not found" } });
    await expect(
      simulateTransaction({ rpcUrl: "http://rpc.test", transactionBase64: "AA==", watchedAddresses: [], fetchImplementation: rpcFailure }),
    ).rejects.toThrow("blockhash not found");
  });

  it("raises a typed timeout when the RPC never answers", async () => {
    const hangingFetch: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      });
    await expect(
      simulateTransaction({
        rpcUrl: "http://rpc.test",
        transactionBase64: "AA==",
        watchedAddresses: [],
        timeoutMilliseconds: 20,
        fetchImplementation: hangingFetch,
      }),
    ).rejects.toBeInstanceOf(SimulationTimeoutError);
  });
});
