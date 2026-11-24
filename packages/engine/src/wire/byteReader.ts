import { TransactionParseError } from "../errors.js";

const SHORT_VEC_CONTINUATION_BIT = 0x80;
const SHORT_VEC_VALUE_MASK = 0x7f;
const SHORT_VEC_MAXIMUM_BYTES = 3;
const SHORT_VEC_MAXIMUM_VALUE = 0xffff;
const BITS_PER_SHORT_VEC_BYTE = 7;

export class ByteReader {
  private position = 0;

  constructor(private readonly bytes: Uint8Array) {}

  get remaining(): number {
    return this.bytes.length - this.position;
  }

  readByte(): number {
    const value = this.bytes[this.position];
    if (value === undefined) {
      throw new TransactionParseError("Unexpected end of transaction bytes", { position: this.position });
    }
    this.position += 1;
    return value;
  }

  readBytes(byteCount: number): Uint8Array {
    if (byteCount < 0 || this.position + byteCount > this.bytes.length) {
      throw new TransactionParseError("Length prefix exceeds remaining bytes", {
        position: this.position,
        requested: byteCount,
        remaining: this.remaining,
      });
    }
    const slice = this.bytes.subarray(this.position, this.position + byteCount);
    this.position += byteCount;
    return slice;
  }

  readShortVecLength(): number {
    let value = 0;
    for (let byteIndex = 0; byteIndex < SHORT_VEC_MAXIMUM_BYTES; byteIndex += 1) {
      const current = this.readByte();
      value |= (current & SHORT_VEC_VALUE_MASK) << (byteIndex * BITS_PER_SHORT_VEC_BYTE);
      if ((current & SHORT_VEC_CONTINUATION_BIT) === 0) {
        if (value > SHORT_VEC_MAXIMUM_VALUE) {
          throw new TransactionParseError("Short vector length out of range", { value });
        }
        return value;
      }
    }
    throw new TransactionParseError("Short vector length uses too many bytes");
  }
}

export function readUnsignedLittleEndian(bytes: Uint8Array, offset: number, byteLength: number): bigint {
  if (offset < 0 || offset + byteLength > bytes.length) {
    throw new TransactionParseError("Instruction data too short", { offset, byteLength, available: bytes.length });
  }
  let value = 0n;
  for (let byteIndex = byteLength - 1; byteIndex >= 0; byteIndex -= 1) {
    value = (value << 8n) | BigInt(bytes[offset + byteIndex] ?? 0);
  }
  return value;
}

export function readSignedLittleEndian64(bytes: Uint8Array, offset: number): bigint {
  return BigInt.asIntN(64, readUnsignedLittleEndian(bytes, offset, 8));
}
