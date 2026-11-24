import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getAddressEncoder,
  getBase64Decoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
} from "@solana/kit";
import { MANDATE_ACCOUNT_DISCRIMINATOR, revokeMandateInstruction } from "@selvedge/sdk";

export const FIXTURE_OWNER = "BrEAK7zGZ6dM71zUDACDqJnekihmwF15noTddWTsknjC";
export const FIXTURE_AGENT = "7YWHMfk9JZe3ReJXHqNSbzzBvsd8SS2mTRm5zMrr6ioU";
export const FIXTURE_SECURITY_AUTHORITY = "5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG";
export const FIXTURE_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const FIXTURE_MANDATE_ADDRESS = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
export const FIXTURE_SIGNATURE = "5VERv8NMvzbJMEkV8xnXLu4nzJc84JdJqYGnMYS6hkbJ8EDNSyMvPmmpPNGQcYEe6LPWc6SbjFvAjQJP9vkKJ2gM";
export const FIXTURE_BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
export const FIXTURE_PERIOD_CAP_BASE_UNITS = 50_000_000n;
export const FIXTURE_SPENT_BASE_UNITS = 12_500_000n;
export const FIXTURE_PERIOD_SECONDS = 86_400n;

const ADDRESS_BYTES = 32;
const MAX_PROGRAMS = 4;
const MAX_PAYEES = 4;
const MAX_TOOLS = 8;
const FIXTURE_PERIOD_START_SECONDS = 1_780_000_000n;
const FIXTURE_EXPIRY_SECONDS = 4_000_000_000n;
const FIXTURE_TOOL_IDENTIFIERS = [1n, 2n];

const addressEncoder = getAddressEncoder();
const base64Decoder = getBase64Decoder();
const transactionEncoder = getTransactionEncoder();

class ByteWriter {
  private readonly chunks: number[] = [];

  byte(value: number): void {
    this.chunks.push(value);
  }

  unsigned64(value: bigint): void {
    this.signed64(value);
  }

  signed64(value: bigint): void {
    const buffer = new DataView(new ArrayBuffer(8));
    buffer.setBigInt64(0, value, true);
    for (let offset = 0; offset < 8; offset += 1) this.chunks.push(buffer.getUint8(offset));
  }

  address(address: string): void {
    this.chunks.push(...addressEncoder.encode(address as Address));
  }

  emptyAddresses(count: number): void {
    for (let index = 0; index < count * ADDRESS_BYTES; index += 1) this.chunks.push(0);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

export function encodeFixtureMandate(options: { readonly revoked: boolean }): Uint8Array {
  const writer = new ByteWriter();
  for (const discriminatorByte of MANDATE_ACCOUNT_DISCRIMINATOR) writer.byte(discriminatorByte);
  writer.byte(1);
  writer.byte(255);
  writer.unsigned64(7n);
  writer.address(FIXTURE_OWNER);
  writer.address(FIXTURE_AGENT);
  writer.address(FIXTURE_SECURITY_AUTHORITY);
  writer.address(FIXTURE_MINT);
  writer.unsigned64(FIXTURE_PERIOD_CAP_BASE_UNITS);
  writer.signed64(FIXTURE_PERIOD_SECONDS);
  writer.signed64(FIXTURE_PERIOD_START_SECONDS);
  writer.unsigned64(FIXTURE_SPENT_BASE_UNITS);
  writer.signed64(FIXTURE_EXPIRY_SECONDS);
  writer.byte(options.revoked ? 1 : 0);
  writer.unsigned64(3n);
  writer.address(FIXTURE_MINT);
  writer.emptyAddresses(MAX_PROGRAMS - 1);
  writer.byte(1);
  writer.address(FIXTURE_OWNER);
  writer.emptyAddresses(MAX_PAYEES - 1);
  writer.byte(1);
  for (let toolIndex = 0; toolIndex < MAX_TOOLS; toolIndex += 1) writer.unsigned64(FIXTURE_TOOL_IDENTIFIERS[toolIndex] ?? 0n);
  writer.byte(FIXTURE_TOOL_IDENTIFIERS.length);
  return writer.toBytes();
}

export function encodeBase64(bytes: Uint8Array): string {
  return base64Decoder.decode(bytes);
}

export function buildRevokeTransactionBase64(): string {
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (draft) => setTransactionMessageFeePayer(FIXTURE_OWNER as Address, draft),
    (draft) =>
      setTransactionMessageLifetimeUsingBlockhash({ blockhash: FIXTURE_BLOCKHASH as Blockhash, lastValidBlockHeight: 1_000n }, draft),
    (draft) => appendTransactionMessageInstruction(revokeMandateInstruction(FIXTURE_OWNER, FIXTURE_MANDATE_ADDRESS), draft),
  );
  return base64Decoder.decode(transactionEncoder.encode(compileTransaction(message)));
}
