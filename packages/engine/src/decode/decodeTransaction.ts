import { getBase64Encoder } from "@solana/kit";
import { TransactionParseError } from "../errors.js";
import type { DecodedInstruction, DecodedTransaction } from "../types.js";
import { parseTransaction, type RawTransaction } from "../wire/parseTransaction.js";
import { decodeInstruction } from "./instructionDecoders.js";

export type LookupTableContents = Readonly<Record<string, readonly string[]>>;

const base64Encoder = getBase64Encoder();

function resolveAccountKeys(
  raw: RawTransaction,
  lookupTables: LookupTableContents,
): { keys: string[]; resolved: boolean } {
  const keys = [...raw.staticAccountKeys];
  if (raw.lookups.length === 0) {
    return { keys, resolved: true };
  }
  const writable: string[] = [];
  const readonly: string[] = [];
  for (const lookup of raw.lookups) {
    const tableEntries = lookupTables[lookup.tableAddress];
    if (tableEntries === undefined) {
      return { keys, resolved: false };
    }
    for (const writableIndex of lookup.writableIndexes) {
      const entry = tableEntries[writableIndex];
      if (entry === undefined) {
        throw new TransactionParseError("Lookup index outside the table", {
          table: lookup.tableAddress,
          index: writableIndex,
        });
      }
      writable.push(entry);
    }
    for (const readonlyIndex of lookup.readonlyIndexes) {
      const entry = tableEntries[readonlyIndex];
      if (entry === undefined) {
        throw new TransactionParseError("Lookup index outside the table", {
          table: lookup.tableAddress,
          index: readonlyIndex,
        });
      }
      readonly.push(entry);
    }
  }
  return { keys: [...keys, ...writable, ...readonly], resolved: true };
}

function decodeInstructions(raw: RawTransaction, accountKeys: readonly string[], resolved: boolean): DecodedInstruction[] {
  const decoded: DecodedInstruction[] = [];
  for (const instruction of raw.instructions) {
    const programId = accountKeys[instruction.programIdIndex];
    if (programId === undefined) {
      if (!resolved) {
        decoded.push({
          programId: "unresolved",
          programLabel: "Unresolved program",
          known: false,
          kind: "unresolved",
          accounts: [],
          details: { programIdIndex: instruction.programIdIndex },
        });
        continue;
      }
      throw new TransactionParseError("Instruction references a missing program account", {
        programIdIndex: instruction.programIdIndex,
      });
    }
    const accounts = instruction.accountIndexes.map((accountIndex) => accountKeys[accountIndex] ?? `unresolved:${accountIndex}`);
    decoded.push(decodeInstruction(programId, accounts, instruction.data));
  }
  return decoded;
}

export function decodeTransactionBytes(
  transactionBytes: Uint8Array,
  lookupTables: LookupTableContents = {},
): DecodedTransaction {
  const raw = parseTransaction(transactionBytes);
  const { keys, resolved } = resolveAccountKeys(raw, lookupTables);
  const feePayer = raw.staticAccountKeys[0];
  if (feePayer === undefined) {
    throw new TransactionParseError("Transaction has no fee payer");
  }
  return {
    version: raw.version,
    signatureCount: raw.signatureCount,
    requiredSignerCount: raw.requiredSignerCount,
    feePayer,
    requiredSigners: raw.staticAccountKeys.slice(0, raw.requiredSignerCount),
    recentBlockhash: raw.recentBlockhash,
    staticAccountKeys: raw.staticAccountKeys,
    addressTableLookups: raw.lookups,
    lookupsResolved: resolved,
    resolvedAccountKeys: keys,
    instructions: decodeInstructions(raw, keys, resolved),
  };
}

export function decodeTransactionBase64(transactionBase64: string, lookupTables: LookupTableContents = {}): DecodedTransaction {
  const transactionBytes = new Uint8Array(base64Encoder.encode(transactionBase64));
  return decodeTransactionBytes(transactionBytes, lookupTables);
}
