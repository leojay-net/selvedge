import { getAddressDecoder } from "@solana/kit";
import {
  NATIVE_ASSET,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_ACCOUNT_AMOUNT_OFFSET,
  TOKEN_ACCOUNT_MINIMUM_LENGTH,
  TOKEN_ACCOUNT_MINT_OFFSET,
  TOKEN_ACCOUNT_OWNER_OFFSET,
  PUBLIC_KEY_BYTE_LENGTH,
  SYSTEM_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../constants.js";
import type { AssetDelta } from "../types.js";
import { readUnsignedLittleEndian } from "../wire/byteReader.js";

const addressDecoder = getAddressDecoder();

export interface AccountSnapshot {
  readonly address: string;
  readonly lamports: bigint;
  readonly ownerProgram: string;
  readonly data: Uint8Array;
}

interface Holding {
  readonly owner: string;
  readonly asset: string;
  readonly amount: bigint;
}

function readTokenHolding(snapshot: AccountSnapshot): Holding | null {
  const isTokenProgram = snapshot.ownerProgram === TOKEN_PROGRAM_ID || snapshot.ownerProgram === TOKEN_2022_PROGRAM_ID;
  if (!isTokenProgram || snapshot.data.length < TOKEN_ACCOUNT_MINIMUM_LENGTH) return null;
  const mint = addressDecoder.decode(
    snapshot.data.subarray(TOKEN_ACCOUNT_MINT_OFFSET, TOKEN_ACCOUNT_MINT_OFFSET + PUBLIC_KEY_BYTE_LENGTH),
  );
  const owner = addressDecoder.decode(
    snapshot.data.subarray(TOKEN_ACCOUNT_OWNER_OFFSET, TOKEN_ACCOUNT_OWNER_OFFSET + PUBLIC_KEY_BYTE_LENGTH),
  );
  const amount = readUnsignedLittleEndian(snapshot.data, TOKEN_ACCOUNT_AMOUNT_OFFSET, 8);
  return { owner, asset: mint, amount };
}

function collectHoldings(snapshots: readonly AccountSnapshot[]): Map<string, Holding> {
  const holdings = new Map<string, Holding>();
  for (const snapshot of snapshots) {
    const tokenHolding = readTokenHolding(snapshot);
    if (tokenHolding !== null) {
      const key = `${tokenHolding.owner}|${tokenHolding.asset}`;
      const existing = holdings.get(key);
      holdings.set(key, {
        ...tokenHolding,
        amount: (existing?.amount ?? 0n) + tokenHolding.amount,
      });
    } else if (snapshot.ownerProgram === SYSTEM_PROGRAM_ID) {
      holdings.set(`${snapshot.address}|${NATIVE_ASSET}`, {
        owner: snapshot.address,
        asset: NATIVE_ASSET,
        amount: snapshot.lamports,
      });
    }
  }
  return holdings;
}

export function computeAssetDeltas(
  before: readonly AccountSnapshot[],
  after: readonly AccountSnapshot[],
): AssetDelta[] {
  const beforeHoldings = collectHoldings(before);
  const afterHoldings = collectHoldings(after);
  const keys = new Set<string>([...beforeHoldings.keys(), ...afterHoldings.keys()]);
  const deltas: AssetDelta[] = [];
  for (const key of [...keys].sort()) {
    const beforeHolding = beforeHoldings.get(key);
    const afterHolding = afterHoldings.get(key);
    const reference = afterHolding ?? beforeHolding;
    if (reference === undefined) continue;
    const beforeAmount = beforeHolding?.amount ?? 0n;
    const afterAmount = afterHolding?.amount ?? 0n;
    if (beforeAmount === afterAmount) continue;
    deltas.push({
      owner: reference.owner,
      asset: reference.asset,
      before: beforeAmount.toString(),
      after: afterAmount.toString(),
      change: (afterAmount - beforeAmount).toString(),
    });
  }
  return deltas;
}
