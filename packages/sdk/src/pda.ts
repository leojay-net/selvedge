import { getAddressEncoder, getProgramDerivedAddress, type Address } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  MANDATE_PROGRAM_ADDRESS,
  MANDATE_SEED,
  TOKEN_PROGRAM_ADDRESS,
} from "./constants.js";
import { encodeUnsigned } from "./encoding.js";

const addressEncoder = getAddressEncoder();
const textEncoder = new TextEncoder();
const MANDATE_ID_BYTES = 8;

export async function deriveMandateAddress(ownerAddress: string, mandateId: bigint): Promise<string> {
  const [mandateAddress] = await getProgramDerivedAddress({
    programAddress: MANDATE_PROGRAM_ADDRESS as Address,
    seeds: [
      textEncoder.encode(MANDATE_SEED),
      addressEncoder.encode(ownerAddress as Address),
      Uint8Array.from(encodeUnsigned(mandateId, MANDATE_ID_BYTES)),
    ],
  });
  return mandateAddress;
}

export async function deriveAssociatedTokenAddress(ownerAddress: string, mintAddress: string): Promise<string> {
  const [associatedAddress] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS as Address,
    seeds: [
      addressEncoder.encode(ownerAddress as Address),
      addressEncoder.encode(TOKEN_PROGRAM_ADDRESS as Address),
      addressEncoder.encode(mintAddress as Address),
    ],
  });
  return associatedAddress;
}
