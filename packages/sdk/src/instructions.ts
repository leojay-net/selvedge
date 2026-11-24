import { AccountRole, type Address, type Instruction } from "@solana/kit";
import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  INSTRUCTION_DISCRIMINATORS,
  MANDATE_PROGRAM_ADDRESS,
  SYSTEM_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from "./constants.js";
import { encodeAddress, encodeAddressVector, encodeSigned64, encodeUnsigned, encodeUnsignedVector } from "./encoding.js";
import type { MandateLimits } from "./types.js";

const UINT64_BYTES = 8;
const TOKEN_APPROVE_CODE = 4;
const TOKEN_REVOKE_CODE = 5;

function asAddress(value: string): Address {
  return value as Address;
}

function encodeLimits(limits: MandateLimits): number[] {
  return [
    ...encodeUnsigned(limits.periodCap, UINT64_BYTES),
    ...encodeSigned64(limits.periodSeconds),
    ...encodeSigned64(limits.expiry),
    ...encodeAddressVector(limits.allowedPrograms),
    ...encodeAddressVector(limits.allowedPayees),
    ...encodeUnsignedVector(limits.allowedTools),
  ];
}

function mandateInstruction(
  discriminator: readonly number[],
  argumentBytes: readonly number[],
  accounts: NonNullable<Instruction["accounts"]>,
): Instruction {
  return {
    programAddress: asAddress(MANDATE_PROGRAM_ADDRESS),
    accounts,
    data: Uint8Array.from([...discriminator, ...argumentBytes]),
  };
}

export interface CreateMandateInput {
  readonly ownerAddress: string;
  readonly mandateAddress: string;
  readonly mandateId: bigint;
  readonly agentAddress: string;
  readonly securityAuthorityAddress: string;
  readonly mintAddress: string;
  readonly limits: MandateLimits;
}

export function createMandateInstruction(input: CreateMandateInput): Instruction {
  return mandateInstruction(
    INSTRUCTION_DISCRIMINATORS.createMandate,
    [
      ...encodeUnsigned(input.mandateId, UINT64_BYTES),
      ...encodeAddress(input.agentAddress),
      ...encodeAddress(input.securityAuthorityAddress),
      ...encodeAddress(input.mintAddress),
      ...encodeLimits(input.limits),
    ],
    [
      { address: asAddress(input.ownerAddress), role: AccountRole.WRITABLE_SIGNER },
      { address: asAddress(input.mandateAddress), role: AccountRole.WRITABLE },
      { address: asAddress(SYSTEM_PROGRAM_ADDRESS), role: AccountRole.READONLY },
    ],
  );
}

export function updateLimitsInstruction(signerAddress: string, mandateAddress: string, limits: MandateLimits): Instruction {
  return mandateInstruction(INSTRUCTION_DISCRIMINATORS.updateLimits, encodeLimits(limits), [
    { address: asAddress(signerAddress), role: AccountRole.READONLY_SIGNER },
    { address: asAddress(mandateAddress), role: AccountRole.WRITABLE },
  ]);
}

export function revokeMandateInstruction(signerAddress: string, mandateAddress: string): Instruction {
  return mandateInstruction(INSTRUCTION_DISCRIMINATORS.revokeMandate, [], [
    { address: asAddress(signerAddress), role: AccountRole.READONLY_SIGNER },
    { address: asAddress(mandateAddress), role: AccountRole.WRITABLE },
  ]);
}

export function rotateAgentInstruction(signerAddress: string, mandateAddress: string, newAgentAddress: string): Instruction {
  return mandateInstruction(INSTRUCTION_DISCRIMINATORS.rotateAgent, encodeAddress(newAgentAddress), [
    { address: asAddress(signerAddress), role: AccountRole.READONLY_SIGNER },
    { address: asAddress(mandateAddress), role: AccountRole.WRITABLE },
  ]);
}

export function closeMandateInstruction(ownerAddress: string, mandateAddress: string): Instruction {
  return mandateInstruction(INSTRUCTION_DISCRIMINATORS.closeMandate, [], [
    { address: asAddress(ownerAddress), role: AccountRole.WRITABLE_SIGNER },
    { address: asAddress(mandateAddress), role: AccountRole.WRITABLE },
  ]);
}

export interface SpendInput {
  readonly agentAddress: string;
  readonly mandateAddress: string;
  readonly mintAddress: string;
  readonly ownerTokenAccount: string;
  readonly payeeTokenAccount: string;
  readonly amount: bigint;
  readonly toolId: bigint;
  readonly expectedNonce: bigint;
}

export function spendInstruction(input: SpendInput): Instruction {
  return mandateInstruction(
    INSTRUCTION_DISCRIMINATORS.spend,
    [
      ...encodeUnsigned(input.amount, UINT64_BYTES),
      ...encodeUnsigned(input.toolId, UINT64_BYTES),
      ...encodeUnsigned(input.expectedNonce, UINT64_BYTES),
    ],
    [
      { address: asAddress(input.agentAddress), role: AccountRole.READONLY_SIGNER },
      { address: asAddress(input.mandateAddress), role: AccountRole.WRITABLE },
      { address: asAddress(input.mintAddress), role: AccountRole.READONLY },
      { address: asAddress(input.ownerTokenAccount), role: AccountRole.WRITABLE },
      { address: asAddress(input.payeeTokenAccount), role: AccountRole.WRITABLE },
      { address: asAddress(TOKEN_PROGRAM_ADDRESS), role: AccountRole.READONLY },
    ],
  );
}

export function approveMandateDelegateInstruction(
  ownerTokenAccount: string,
  mandateAddress: string,
  ownerAddress: string,
  amount: bigint,
): Instruction {
  return {
    programAddress: asAddress(TOKEN_PROGRAM_ADDRESS),
    accounts: [
      { address: asAddress(ownerTokenAccount), role: AccountRole.WRITABLE },
      { address: asAddress(mandateAddress), role: AccountRole.READONLY },
      { address: asAddress(ownerAddress), role: AccountRole.READONLY_SIGNER },
    ],
    data: Uint8Array.from([TOKEN_APPROVE_CODE, ...encodeUnsigned(amount, UINT64_BYTES)]),
  };
}

export function revokeTokenDelegateInstruction(ownerTokenAccount: string, ownerAddress: string): Instruction {
  return {
    programAddress: asAddress(TOKEN_PROGRAM_ADDRESS),
    accounts: [
      { address: asAddress(ownerTokenAccount), role: AccountRole.WRITABLE },
      { address: asAddress(ownerAddress), role: AccountRole.READONLY_SIGNER },
    ],
    data: Uint8Array.from([TOKEN_REVOKE_CODE]),
  };
}

export function createAssociatedTokenAccountIdempotentInstruction(
  payerAddress: string,
  associatedTokenAddress: string,
  ownerAddress: string,
  mintAddress: string,
): Instruction {
  return {
    programAddress: asAddress(ASSOCIATED_TOKEN_PROGRAM_ADDRESS),
    accounts: [
      { address: asAddress(payerAddress), role: AccountRole.WRITABLE_SIGNER },
      { address: asAddress(associatedTokenAddress), role: AccountRole.WRITABLE },
      { address: asAddress(ownerAddress), role: AccountRole.READONLY },
      { address: asAddress(mintAddress), role: AccountRole.READONLY },
      { address: asAddress(SYSTEM_PROGRAM_ADDRESS), role: AccountRole.READONLY },
      { address: asAddress(TOKEN_PROGRAM_ADDRESS), role: AccountRole.READONLY },
    ],
    data: Uint8Array.from([1]),
  };
}
