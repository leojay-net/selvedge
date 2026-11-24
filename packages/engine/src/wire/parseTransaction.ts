import { getAddressDecoder } from "@solana/kit";
import {
  PUBLIC_KEY_BYTE_LENGTH,
  SIGNATURE_BYTE_LENGTH,
  VERSION_PREFIX_FLAG,
  VERSION_PREFIX_MASK,
  MAXIMUM_TRANSACTION_BYTES,
} from "../constants.js";
import { TransactionParseError } from "../errors.js";
import { ByteReader } from "./byteReader.js";

const SUPPORTED_MESSAGE_VERSION = 0;
const addressDecoder = getAddressDecoder();

export interface RawInstruction {
  readonly programIdIndex: number;
  readonly accountIndexes: readonly number[];
  readonly data: Uint8Array;
}

export interface RawLookup {
  readonly tableAddress: string;
  readonly writableIndexes: readonly number[];
  readonly readonlyIndexes: readonly number[];
}

export interface RawTransaction {
  readonly version: "legacy" | 0;
  readonly signatureCount: number;
  readonly requiredSignerCount: number;
  readonly readonlySignedCount: number;
  readonly readonlyUnsignedCount: number;
  readonly staticAccountKeys: readonly string[];
  readonly recentBlockhash: string;
  readonly instructions: readonly RawInstruction[];
  readonly lookups: readonly RawLookup[];
}

function readAddress(reader: ByteReader): string {
  return addressDecoder.decode(reader.readBytes(PUBLIC_KEY_BYTE_LENGTH));
}

function readIndexVector(reader: ByteReader): number[] {
  const length = reader.readShortVecLength();
  const indexes: number[] = [];
  for (let indexPosition = 0; indexPosition < length; indexPosition += 1) {
    indexes.push(reader.readByte());
  }
  return indexes;
}

function readInstruction(reader: ByteReader): RawInstruction {
  const programIdIndex = reader.readByte();
  const accountIndexes = readIndexVector(reader);
  const dataLength = reader.readShortVecLength();
  return { programIdIndex, accountIndexes, data: reader.readBytes(dataLength) };
}

function readLookup(reader: ByteReader): RawLookup {
  const tableAddress = readAddress(reader);
  const writableIndexes = readIndexVector(reader);
  const readonlyIndexes = readIndexVector(reader);
  return { tableAddress, writableIndexes, readonlyIndexes };
}

function readVector<Item>(reader: ByteReader, readItem: (itemReader: ByteReader) => Item): Item[] {
  const length = reader.readShortVecLength();
  const items: Item[] = [];
  for (let itemPosition = 0; itemPosition < length; itemPosition += 1) {
    items.push(readItem(reader));
  }
  return items;
}

export function parseTransaction(transactionBytes: Uint8Array): RawTransaction {
  if (transactionBytes.length > MAXIMUM_TRANSACTION_BYTES) {
    throw new TransactionParseError("Transaction exceeds the packet size limit", {
      length: transactionBytes.length,
      limit: MAXIMUM_TRANSACTION_BYTES,
    });
  }
  const reader = new ByteReader(transactionBytes);
  const signatureCount = reader.readShortVecLength();
  reader.readBytes(signatureCount * SIGNATURE_BYTE_LENGTH);

  const firstMessageByte = reader.readByte();
  const isVersioned = (firstMessageByte & VERSION_PREFIX_FLAG) !== 0;
  let version: "legacy" | 0 = "legacy";
  let requiredSignerCount = firstMessageByte;
  if (isVersioned) {
    const versionNumber = firstMessageByte & VERSION_PREFIX_MASK;
    if (versionNumber !== SUPPORTED_MESSAGE_VERSION) {
      throw new TransactionParseError("Unsupported message version", { version: versionNumber });
    }
    version = 0;
    requiredSignerCount = reader.readByte();
  }
  const readonlySignedCount = reader.readByte();
  const readonlyUnsignedCount = reader.readByte();
  const staticAccountKeys = readVector(reader, readAddress);
  const recentBlockhash = readAddress(reader);
  const instructions = readVector(reader, readInstruction);
  const lookups = version === 0 ? readVector(reader, readLookup) : [];

  if (reader.remaining !== 0) {
    throw new TransactionParseError("Trailing bytes after transaction", { remaining: reader.remaining });
  }
  if (requiredSignerCount === 0 || requiredSignerCount > staticAccountKeys.length) {
    throw new TransactionParseError("Invalid required signer count", { requiredSignerCount });
  }
  return {
    version,
    signatureCount,
    requiredSignerCount,
    readonlySignedCount,
    readonlyUnsignedCount,
    staticAccountKeys,
    recentBlockhash,
    instructions,
    lookups,
  };
}
