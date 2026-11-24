import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { MANDATE_PROGRAM_ADDRESS } from "@selvedge/sdk";
import {
  FIXTURE_BLOCKHASH,
  FIXTURE_MANDATE_ADDRESS,
  FIXTURE_SIGNATURE,
  buildRevokeTransactionBase64,
  encodeBase64,
  encodeFixtureMandate,
} from "./chainFixtures";

const FIXTURE_PORT = 8899;
const FIXTURE_SLOT = 400_000_000;
const FIXTURE_BLOCK_TIME_SECONDS = 1_780_000_500;
const LOADER_ADDRESS = "BPFLoaderUpgradeab1e11111111111111111111111";
const FIXTURE_LAMPORTS = 1_461_600;

interface RpcCall {
  readonly method: string;
  readonly params: readonly unknown[];
}

const containmentPayload = {
  entries: [
    {
      id: "c-1",
      timestamp: "2026-11-24 09:12:44 UTC",
      agent: "treasury-agent",
      attempt: "Transfer 900 USDC to an unlisted payee",
      gate: "mandate-program",
      reason: "The payee is not on the mandate allowlist.",
    },
    {
      id: "c-2",
      timestamp: "2026-11-24 09:15:03 UTC",
      agent: "treasury-agent",
      attempt: "Call an unlisted program",
      gate: "engine-policy",
      reason: "The program is not allowlisted for this mandate.",
    },
  ],
};

function accountEnvelope(data: Uint8Array, executable: boolean): unknown {
  return { data: [encodeBase64(data), "base64"], executable, lamports: FIXTURE_LAMPORTS, owner: LOADER_ADDRESS, rentEpoch: 0, space: data.length };
}

function answer(call: RpcCall): unknown {
  const context = { slot: FIXTURE_SLOT };
  switch (call.method) {
    case "getProgramAccounts":
      return [{ pubkey: FIXTURE_MANDATE_ADDRESS, account: accountEnvelope(encodeFixtureMandate({ revoked: false }), false) }];
    case "getAccountInfo": {
      const requested = call.params[0];
      if (requested === MANDATE_PROGRAM_ADDRESS) return { context, value: accountEnvelope(new Uint8Array(0), true) };
      if (requested === FIXTURE_MANDATE_ADDRESS) return { context, value: accountEnvelope(encodeFixtureMandate({ revoked: false }), false) };
      return { context, value: null };
    }
    case "getMultipleAccounts":
      return { context, value: [] };
    case "getSignaturesForAddress":
      return [{ signature: FIXTURE_SIGNATURE, slot: FIXTURE_SLOT, err: null, blockTime: FIXTURE_BLOCK_TIME_SECONDS, confirmationStatus: "confirmed" }];
    case "getTransaction":
      return { slot: FIXTURE_SLOT, blockTime: FIXTURE_BLOCK_TIME_SECONDS, transaction: [buildRevokeTransactionBase64(), "base64"] };
    case "getLatestBlockhash":
      return { context, value: { blockhash: FIXTURE_BLOCKHASH, lastValidBlockHeight: 1_000 } };
    case "simulateTransaction":
      return { context, value: { err: null, logs: [], accounts: null, unitsConsumed: 1_000, returnData: null } };
    default:
      return null;
  }
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const parts: Buffer[] = [];
    request.on("data", (part: Buffer) => parts.push(part));
    request.on("end", () => resolveBody(Buffer.concat(parts).toString("utf8")));
    request.on("error", rejectBody);
  });
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  response.setHeader("content-type", "application/json");
  if (request.method === "GET" && request.url === "/containment") {
    response.end(JSON.stringify(containmentPayload));
    return;
  }
  if (request.method !== "POST") {
    response.statusCode = 404;
    response.end("{}");
    return;
  }
  const call = JSON.parse(await readBody(request)) as RpcCall & { id: number };
  response.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: answer(call) }));
}

createServer((request, response) => {
  handle(request, response).catch((failure: unknown) => {
    response.statusCode = 500;
    response.end(JSON.stringify({ error: String(failure) }));
  });
}).listen(FIXTURE_PORT, "127.0.0.1", () => {
  console.log(`fixture rpc listening on ${FIXTURE_PORT}`);
});
