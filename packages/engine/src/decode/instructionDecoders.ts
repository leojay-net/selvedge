import { getAddressDecoder } from "@solana/kit";
import {
  ADDRESS_LOOKUP_TABLE_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  KNOWN_PROGRAM_LABELS,
  LEGACY_MEMO_PROGRAM_ID,
  MANDATE_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  PUBLIC_KEY_BYTE_LENGTH,
  SYSTEM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../constants.js";
import type { DecodedInstruction, DetailValue } from "../types.js";
import { readSignedLittleEndian64, readUnsignedLittleEndian } from "../wire/byteReader.js";
import * as kinds from "./instructionKinds.js";

const addressDecoder = getAddressDecoder();
const UNKNOWN_PROGRAM_LABEL = "Unknown program";
const MANDATE_DISCRIMINATOR_BYTES = 8;

type Details = Record<string, DetailValue>;
interface DecodedBody {
  readonly kind: string;
  readonly details: Details;
}

function addressAt(data: Uint8Array, offset: number): string {
  return addressDecoder.decode(data.subarray(offset, offset + PUBLIC_KEY_BYTE_LENGTH));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byteValue) => byteValue.toString(16).padStart(2, "0")).join("");
}

function decodeSystem(data: Uint8Array): DecodedBody {
  const code = Number(readUnsignedLittleEndian(data, 0, 4));
  const kind = kinds.SYSTEM_INSTRUCTION_NAMES[code] ?? `unknown-system-${code}`;
  const details: Details = {};
  if (code === kinds.SYSTEM_INSTRUCTION_TRANSFER || code === kinds.SYSTEM_INSTRUCTION_WITHDRAW_NONCE) {
    details.lamports = readUnsignedLittleEndian(data, 4, 8).toString();
  } else if (code === kinds.SYSTEM_INSTRUCTION_TRANSFER_WITH_SEED) {
    details.lamports = readUnsignedLittleEndian(data, 4, 8).toString();
  } else if (code === kinds.SYSTEM_INSTRUCTION_CREATE_ACCOUNT) {
    details.lamports = readUnsignedLittleEndian(data, 4, 8).toString();
    details.space = readUnsignedLittleEndian(data, 12, 8).toString();
    details.owner = addressAt(data, 20);
  } else if (code === kinds.SYSTEM_INSTRUCTION_ASSIGN) {
    details.owner = addressAt(data, 4);
  }
  return { kind, details };
}

function decodeSetAuthority(data: Uint8Array): Details {
  const authorityType = data[1] ?? -1;
  const hasNewAuthority = (data[2] ?? 0) === 1;
  return {
    authorityType: kinds.TOKEN_AUTHORITY_TYPE_NAMES[authorityType] ?? `unknown-${authorityType}`,
    newAuthority: hasNewAuthority ? addressAt(data, 3) : null,
  };
}

function decodeToken(data: Uint8Array): DecodedBody {
  const code = data[0] ?? -1;
  const kind = kinds.TOKEN_INSTRUCTION_NAMES[code] ?? `unknown-token-${code}`;
  const details: Details = {};
  const amountInstructions = [
    kinds.TOKEN_INSTRUCTION_TRANSFER,
    kinds.TOKEN_INSTRUCTION_APPROVE,
    kinds.TOKEN_INSTRUCTION_MINT_TO,
    kinds.TOKEN_INSTRUCTION_BURN,
  ];
  const checkedAmountInstructions = [
    kinds.TOKEN_INSTRUCTION_TRANSFER_CHECKED,
    kinds.TOKEN_INSTRUCTION_APPROVE_CHECKED,
    kinds.TOKEN_INSTRUCTION_MINT_TO_CHECKED,
    kinds.TOKEN_INSTRUCTION_BURN_CHECKED,
  ];
  if (amountInstructions.includes(code)) {
    details.amount = readUnsignedLittleEndian(data, 1, 8).toString();
  } else if (checkedAmountInstructions.includes(code)) {
    details.amount = readUnsignedLittleEndian(data, 1, 8).toString();
    details.decimals = data[9] ?? 0;
  } else if (code === kinds.TOKEN_INSTRUCTION_SET_AUTHORITY) {
    Object.assign(details, decodeSetAuthority(data));
  }
  return { kind, details };
}

function decodeAssociatedToken(data: Uint8Array): DecodedBody {
  const code = data.length === 0 ? 0 : (data[0] ?? 0);
  return { kind: kinds.ASSOCIATED_TOKEN_INSTRUCTION_NAMES[code] ?? `unknown-associated-token-${code}`, details: {} };
}

function decodeComputeBudget(data: Uint8Array): DecodedBody {
  const code = data[0] ?? -1;
  const kind = kinds.COMPUTE_BUDGET_INSTRUCTION_NAMES[code] ?? `unknown-compute-budget-${code}`;
  const details: Details = {};
  if (code === kinds.COMPUTE_BUDGET_SET_UNIT_LIMIT) {
    details.units = Number(readUnsignedLittleEndian(data, 1, 4));
  } else if (code === kinds.COMPUTE_BUDGET_SET_UNIT_PRICE) {
    details.microLamports = readUnsignedLittleEndian(data, 1, 8).toString();
  }
  return { kind, details };
}

function decodeMandate(data: Uint8Array): DecodedBody {
  const discriminatorHex = toHex(data.subarray(0, MANDATE_DISCRIMINATOR_BYTES));
  const match = kinds.MANDATE_INSTRUCTIONS.find((candidate) => candidate.discriminatorHex === discriminatorHex);
  if (match === undefined) {
    return { kind: "unknown-mandate-instruction", details: {} };
  }
  const details: Details = {};
  const argumentsOffset = MANDATE_DISCRIMINATOR_BYTES;
  if (match.name === "spend") {
    details.amount = readUnsignedLittleEndian(data, argumentsOffset, 8).toString();
    details.toolId = readUnsignedLittleEndian(data, argumentsOffset + 8, 8).toString();
    details.expectedNonce = readUnsignedLittleEndian(data, argumentsOffset + 16, 8).toString();
  } else if (match.name === "rotate-agent") {
    details.newAgent = addressAt(data, argumentsOffset);
  } else if (match.name === "create-mandate") {
    details.mandateId = readUnsignedLittleEndian(data, argumentsOffset, 8).toString();
    details.agent = addressAt(data, argumentsOffset + 8);
    details.securityAuthority = addressAt(data, argumentsOffset + 40);
    details.mint = addressAt(data, argumentsOffset + 72);
    details.periodCap = readUnsignedLittleEndian(data, argumentsOffset + 104, 8).toString();
    details.periodSeconds = readSignedLittleEndian64(data, argumentsOffset + 112).toString();
    details.expiry = readSignedLittleEndian64(data, argumentsOffset + 120).toString();
  } else if (match.name === "update-limits") {
    details.periodCap = readUnsignedLittleEndian(data, argumentsOffset, 8).toString();
    details.periodSeconds = readSignedLittleEndian64(data, argumentsOffset + 8).toString();
    details.expiry = readSignedLittleEndian64(data, argumentsOffset + 16).toString();
  }
  return { kind: match.name, details };
}

function decodeBody(programId: string, data: Uint8Array): DecodedBody | null {
  switch (programId) {
    case SYSTEM_PROGRAM_ID:
      return decodeSystem(data);
    case TOKEN_PROGRAM_ID:
    case TOKEN_2022_PROGRAM_ID:
      return decodeToken(data);
    case ASSOCIATED_TOKEN_PROGRAM_ID:
      return decodeAssociatedToken(data);
    case COMPUTE_BUDGET_PROGRAM_ID:
      return decodeComputeBudget(data);
    case MEMO_PROGRAM_ID:
    case LEGACY_MEMO_PROGRAM_ID:
      return { kind: "memo", details: { byteLength: data.length } };
    case ADDRESS_LOOKUP_TABLE_PROGRAM_ID:
      return { kind: "address-lookup-table", details: {} };
    case MANDATE_PROGRAM_ID:
      return decodeMandate(data);
    default:
      return null;
  }
}

export function decodeInstruction(
  programId: string,
  accounts: readonly string[],
  data: Uint8Array,
): DecodedInstruction {
  const body = decodeBody(programId, data);
  if (body === null) {
    return {
      programId,
      programLabel: UNKNOWN_PROGRAM_LABEL,
      known: false,
      kind: "unknown",
      accounts,
      details: { dataByteLength: data.length },
    };
  }
  return {
    programId,
    programLabel: KNOWN_PROGRAM_LABELS[programId] ?? UNKNOWN_PROGRAM_LABEL,
    known: true,
    kind: body.kind,
    accounts,
    details: body.details,
  };
}
