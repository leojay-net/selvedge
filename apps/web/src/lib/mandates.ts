import { getBase58Decoder, getBase64Encoder } from "@solana/kit";
import {
  MANDATE_ACCOUNT_DISCRIMINATOR,
  MANDATE_PROGRAM_ADDRESS,
  decodeMandateAccount,
  type MandateAccount,
} from "@selvedge/sdk";
import { callRpc } from "./rpc";

const base58Decoder = getBase58Decoder();
const base64Encoder = getBase64Encoder();

interface RpcAccountValue {
  readonly data: readonly [string, string];
}

interface ProgramAccountEntry {
  readonly pubkey: string;
  readonly account: RpcAccountValue;
}

export type MandateStatus = "active" | "revoked" | "expired";

export function mandateStatus(mandate: MandateAccount, nowSeconds: bigint): MandateStatus {
  if (mandate.revoked) return "revoked";
  if (nowSeconds >= mandate.expiry) return "expired";
  return "active";
}

function accountBytes(account: RpcAccountValue): Uint8Array {
  return new Uint8Array(base64Encoder.encode(account.data[0]));
}

export async function fetchAllMandates(): Promise<MandateAccount[]> {
  const discriminatorBase58 = base58Decoder.decode(Uint8Array.from(MANDATE_ACCOUNT_DISCRIMINATOR));
  const entries = await callRpc<ProgramAccountEntry[]>("getProgramAccounts", [
    MANDATE_PROGRAM_ADDRESS,
    { encoding: "base64", filters: [{ memcmp: { offset: 0, bytes: discriminatorBase58 } }] },
  ]);
  const mandates: MandateAccount[] = [];
  for (const entry of entries) {
    mandates.push(decodeMandateAccount(entry.pubkey, accountBytes(entry.account)));
  }
  return mandates.sort((first, second) => Number(second.periodStart - first.periodStart));
}

export async function fetchMandate(mandateAddress: string): Promise<MandateAccount | null> {
  const response = await callRpc<{ value: RpcAccountValue | null }>("getAccountInfo", [mandateAddress, { encoding: "base64" }]);
  if (response.value === null) return null;
  return decodeMandateAccount(mandateAddress, accountBytes(response.value));
}

export async function fetchProgramDeployment(): Promise<{ executable: boolean; dataLength: number } | null> {
  const response = await callRpc<{ value: { executable: boolean; data: readonly [string, string] } | null }>("getAccountInfo", [
    MANDATE_PROGRAM_ADDRESS,
    { encoding: "base64", dataSlice: { offset: 0, length: 0 } },
  ]);
  if (response.value === null) return null;
  return { executable: response.value.executable, dataLength: base64Encoder.encode(response.value.data[0]).length };
}
