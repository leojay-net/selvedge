import { getAddressDecoder, getAddressEncoder, getBase64Decoder } from "@solana/kit";
import { createHash } from "node:crypto";

const addressDecoder = getAddressDecoder();
const addressEncoder = getAddressEncoder();
const base64Decoder = getBase64Decoder();
const SIGNATURE_BYTES = 64;
const VERSION_ZERO_PREFIX = 0x80;

export interface AccountMeta {
  readonly address: string;
  readonly isSigner: boolean;
  readonly isWritable: boolean;
}

export interface InstructionSpec {
  readonly programId: string;
  readonly accounts: readonly AccountMeta[];
  readonly data: Uint8Array;
}

export interface LookupSpec {
  readonly tableAddress: string;
  readonly writableIndexes: readonly number[];
  readonly readonlyIndexes: readonly number[];
}

export interface TransactionSpec {
  readonly version: "legacy" | 0;
  readonly feePayer: string;
  readonly instructions: readonly InstructionSpec[];
  readonly lookups?: readonly LookupSpec[];
  readonly lookedUpAddresses?: ReadonlySet<string>;
}

export function deterministicAddress(label: string): string {
  const digest = createHash("sha256").update(`selvedge-test-key:${label}`).digest();
  return addressDecoder.decode(new Uint8Array(digest));
}

export function encodeShortVec(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  for (;;) {
    const low = remaining & 0x7f;
    remaining >>= 7;
    if (remaining === 0) {
      bytes.push(low);
      return bytes;
    }
    bytes.push(low | 0x80);
  }
}

function addressBytes(address: string): number[] {
  return [...addressEncoder.encode(address as Parameters<typeof addressEncoder.encode>[0])];
}

interface MergedAccount {
  address: string;
  isSigner: boolean;
  isWritable: boolean;
}

function mergeAccounts(spec: TransactionSpec): MergedAccount[] {
  const merged = new Map<string, MergedAccount>();
  merged.set(spec.feePayer, { address: spec.feePayer, isSigner: true, isWritable: true });
  for (const instruction of spec.instructions) {
    for (const meta of instruction.accounts) {
      if (spec.lookedUpAddresses?.has(meta.address) === true) continue;
      const existing = merged.get(meta.address);
      merged.set(meta.address, {
        address: meta.address,
        isSigner: (existing?.isSigner ?? false) || meta.isSigner,
        isWritable: (existing?.isWritable ?? false) || meta.isWritable,
      });
    }
    if (!merged.has(instruction.programId) && spec.lookedUpAddresses?.has(instruction.programId) !== true) {
      merged.set(instruction.programId, { address: instruction.programId, isSigner: false, isWritable: false });
    }
  }
  return [...merged.values()];
}

function orderAccounts(accounts: MergedAccount[], feePayer: string): MergedAccount[] {
  const category = (account: MergedAccount): number => {
    if (account.address === feePayer) return 0;
    if (account.isSigner && account.isWritable) return 1;
    if (account.isSigner) return 2;
    return account.isWritable ? 3 : 4;
  };
  return [...accounts].sort((first, second) => category(first) - category(second));
}

export function buildTransactionBytes(spec: TransactionSpec): Uint8Array {
  const ordered = orderAccounts(mergeAccounts(spec), spec.feePayer);
  const signerCount = ordered.filter((account) => account.isSigner).length;
  const readonlySignedCount = ordered.filter((account) => account.isSigner && !account.isWritable).length;
  const readonlyUnsignedCount = ordered.filter((account) => !account.isSigner && !account.isWritable).length;
  const staticKeys = ordered.map((account) => account.address);
  const lookedUp = [...(spec.lookedUpAddresses ?? [])];
  const allKeys = [...staticKeys, ...lookedUp];

  const message: number[] = [];
  if (spec.version === 0) message.push(VERSION_ZERO_PREFIX);
  message.push(signerCount, readonlySignedCount, readonlyUnsignedCount);
  message.push(...encodeShortVec(staticKeys.length));
  for (const address of staticKeys) message.push(...addressBytes(address));
  message.push(...addressBytes(deterministicAddress("blockhash")));
  message.push(...encodeShortVec(spec.instructions.length));
  for (const instruction of spec.instructions) {
    const programIndex = allKeys.indexOf(instruction.programId);
    message.push(programIndex);
    message.push(...encodeShortVec(instruction.accounts.length));
    for (const meta of instruction.accounts) message.push(allKeys.indexOf(meta.address));
    message.push(...encodeShortVec(instruction.data.length));
    message.push(...instruction.data);
  }
  if (spec.version === 0) {
    const lookups = spec.lookups ?? [];
    message.push(...encodeShortVec(lookups.length));
    for (const lookup of lookups) {
      message.push(...addressBytes(lookup.tableAddress));
      message.push(...encodeShortVec(lookup.writableIndexes.length), ...lookup.writableIndexes);
      message.push(...encodeShortVec(lookup.readonlyIndexes.length), ...lookup.readonlyIndexes);
    }
  }
  const signatures = [...encodeShortVec(signerCount), ...new Array<number>(signerCount * SIGNATURE_BYTES).fill(0)];
  return Uint8Array.from([...signatures, ...message]);
}

export function transactionBase64(spec: TransactionSpec): string {
  return base64Decoder.decode(buildTransactionBytes(spec));
}

export function littleEndian(value: bigint, byteLength: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  for (let byteIndex = 0; byteIndex < byteLength; byteIndex += 1) {
    bytes.push(Number(remaining & 0xffn));
    remaining >>= 8n;
  }
  return bytes;
}

export function systemTransferData(lamports: bigint): Uint8Array {
  return Uint8Array.from([...littleEndian(2n, 4), ...littleEndian(lamports, 8)]);
}

export function systemAssignData(ownerAddress: string): Uint8Array {
  return Uint8Array.from([...littleEndian(1n, 4), ...addressBytes(ownerAddress)]);
}

export function tokenAmountData(instructionCode: number, amount: bigint, decimals?: number): Uint8Array {
  const bytes = [instructionCode, ...littleEndian(amount, 8)];
  if (decimals !== undefined) bytes.push(decimals);
  return Uint8Array.from(bytes);
}

export function tokenSetAuthorityData(authorityType: number, newAuthority: string | null): Uint8Array {
  const bytes = [6, authorityType];
  if (newAuthority === null) {
    bytes.push(0);
  } else {
    bytes.push(1, ...addressBytes(newAuthority));
  }
  return Uint8Array.from(bytes);
}

export function computeBudgetLimitData(units: number): Uint8Array {
  return Uint8Array.from([2, ...littleEndian(BigInt(units), 4)]);
}

export function computeBudgetPriceData(microLamports: bigint): Uint8Array {
  return Uint8Array.from([3, ...littleEndian(microLamports, 8)]);
}

export function mandateInstructionData(discriminatorHex: string, argumentBytes: readonly number[]): Uint8Array {
  const discriminator = discriminatorHex.match(/../g)?.map((pair) => Number.parseInt(pair, 16)) ?? [];
  return Uint8Array.from([...discriminator, ...argumentBytes]);
}

export function addressToBytes(address: string): number[] {
  return addressBytes(address);
}
