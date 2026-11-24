import { ACCOUNT_DISCRIMINATOR_BYTES, MANDATE_ACCOUNT_DISCRIMINATOR, MAX_ALLOWED_PAYEES, MAX_ALLOWED_PROGRAMS, MAX_ALLOWED_TOOLS } from "./constants.js";
import { AccountDataReader } from "./encoding.js";
import type { MandateAccount } from "./types.js";

export class MandateAccountDecodeError extends Error {
  constructor(message: string, readonly mandateAddress: string) {
    super(`${message} (account ${mandateAddress})`);
    this.name = "MandateAccountDecodeError";
  }
}

function hasMandateDiscriminator(data: Uint8Array): boolean {
  return MANDATE_ACCOUNT_DISCRIMINATOR.every((expectedByte, byteIndex) => data[byteIndex] === expectedByte);
}

export function decodeMandateAccount(mandateAddress: string, data: Uint8Array): MandateAccount {
  if (data.length < ACCOUNT_DISCRIMINATOR_BYTES || !hasMandateDiscriminator(data)) {
    throw new MandateAccountDecodeError("Account data does not carry the mandate discriminator", mandateAddress);
  }
  const reader = new AccountDataReader(data);
  reader.skip(ACCOUNT_DISCRIMINATOR_BYTES);
  const version = reader.readByte();
  const bump = reader.readByte();
  const mandateId = reader.readUnsigned(8);
  const owner = reader.readAddress();
  const agent = reader.readAddress();
  const securityAuthority = reader.readAddress();
  const mint = reader.readAddress();
  const periodCap = reader.readUnsigned(8);
  const periodSeconds = reader.readSigned64();
  const periodStart = reader.readSigned64();
  const spentInPeriod = reader.readUnsigned(8);
  const expiry = reader.readSigned64();
  const revoked = reader.readByte() === 1;
  const nonce = reader.readUnsigned(8);
  const programs = Array.from({ length: MAX_ALLOWED_PROGRAMS }, () => reader.readAddress());
  const programCount = reader.readByte();
  const payees = Array.from({ length: MAX_ALLOWED_PAYEES }, () => reader.readAddress());
  const payeeCount = reader.readByte();
  const tools = Array.from({ length: MAX_ALLOWED_TOOLS }, () => reader.readUnsigned(8));
  const toolCount = reader.readByte();
  return {
    address: mandateAddress,
    version,
    bump,
    mandateId,
    owner,
    agent,
    securityAuthority,
    mint,
    periodCap,
    periodSeconds,
    periodStart,
    spentInPeriod,
    expiry,
    revoked,
    nonce,
    allowedPrograms: programs.slice(0, programCount),
    allowedPayees: payees.slice(0, payeeCount),
    allowedTools: tools.slice(0, toolCount),
  };
}
