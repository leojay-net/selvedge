import { getAddressDecoder, getAddressEncoder, type Address } from "@solana/kit";

const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();
const U32_BYTES = 4;
const U64_BYTES = 8;
const PUBLIC_KEY_BYTES = 32;

export function encodeUnsigned(value: bigint, byteLength: number): number[] {
  if (value < 0n || value >= 1n << BigInt(byteLength * 8)) {
    throw new RangeError(`Value ${value} does not fit in ${byteLength} unsigned bytes`);
  }
  const bytes: number[] = [];
  let remaining = value;
  for (let byteIndex = 0; byteIndex < byteLength; byteIndex += 1) {
    bytes.push(Number(remaining & 0xffn));
    remaining >>= 8n;
  }
  return bytes;
}

export function encodeSigned64(value: bigint): number[] {
  return encodeUnsigned(BigInt.asUintN(64, value), U64_BYTES);
}

export function encodeAddress(address: string): number[] {
  return [...addressEncoder.encode(address as Address)];
}

export function encodeAddressVector(addresses: readonly string[]): number[] {
  return [...encodeUnsigned(BigInt(addresses.length), U32_BYTES), ...addresses.flatMap(encodeAddress)];
}

export function encodeUnsignedVector(values: readonly bigint[]): number[] {
  return [
    ...encodeUnsigned(BigInt(values.length), U32_BYTES),
    ...values.flatMap((value) => encodeUnsigned(value, U64_BYTES)),
  ];
}

export class AccountDataReader {
  private offset = 0;

  constructor(private readonly data: Uint8Array) {}

  skip(byteCount: number): void {
    this.offset += byteCount;
  }

  readUnsigned(byteLength: number): bigint {
    let value = 0n;
    for (let byteIndex = byteLength - 1; byteIndex >= 0; byteIndex -= 1) {
      value = (value << 8n) | BigInt(this.data[this.offset + byteIndex] ?? 0);
    }
    this.offset += byteLength;
    return value;
  }

  readSigned64(): bigint {
    return BigInt.asIntN(64, this.readUnsigned(U64_BYTES));
  }

  readByte(): number {
    return Number(this.readUnsigned(1));
  }

  readAddress(): string {
    const slice = this.data.subarray(this.offset, this.offset + PUBLIC_KEY_BYTES);
    this.offset += PUBLIC_KEY_BYTES;
    return addressDecoder.decode(slice);
  }
}
