import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  COMPUTE_BUDGET_PROGRAM_ID,
  MANDATE_PROGRAM_ID,
  MEMO_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "../../src/constants.js";
import {
  addressToBytes,
  computeBudgetLimitData,
  computeBudgetPriceData,
  mandateInstructionData,
  systemAssignData,
  systemTransferData,
  tokenAmountData,
  tokenSetAuthorityData,
  type InstructionSpec,
  littleEndian,
} from "./transactionBuilder.js";

const signerWritable = (address: string) => ({ address, isSigner: true, isWritable: true });
const signerReadonly = (address: string) => ({ address, isSigner: true, isWritable: false });
const writable = (address: string) => ({ address, isSigner: false, isWritable: true });
const readonlyAccount = (address: string) => ({ address, isSigner: false, isWritable: false });

export function solTransfer(from: string, to: string, lamports: bigint): InstructionSpec {
  return {
    programId: SYSTEM_PROGRAM_ID,
    accounts: [signerWritable(from), writable(to)],
    data: systemTransferData(lamports),
  };
}

export function systemAssign(account: string, owner: string): InstructionSpec {
  return { programId: SYSTEM_PROGRAM_ID, accounts: [signerWritable(account)], data: systemAssignData(owner) };
}

export function tokenTransferChecked(
  programId: string,
  source: string,
  mint: string,
  destination: string,
  authority: string,
  amount: bigint,
  decimals: number,
): InstructionSpec {
  return {
    programId,
    accounts: [writable(source), readonlyAccount(mint), writable(destination), signerReadonly(authority)],
    data: tokenAmountData(12, amount, decimals),
  };
}

export function tokenApprove(source: string, delegate: string, owner: string, amount: bigint): InstructionSpec {
  return {
    programId: TOKEN_PROGRAM_ID,
    accounts: [writable(source), readonlyAccount(delegate), signerReadonly(owner)],
    data: tokenAmountData(4, amount),
  };
}

export function tokenSetAuthority(account: string, currentAuthority: string, authorityType: number, newAuthority: string | null): InstructionSpec {
  return {
    programId: TOKEN_PROGRAM_ID,
    accounts: [writable(account), signerReadonly(currentAuthority)],
    data: tokenSetAuthorityData(authorityType, newAuthority),
  };
}

export function tokenCloseAccount(account: string, destination: string, owner: string): InstructionSpec {
  return {
    programId: TOKEN_PROGRAM_ID,
    accounts: [writable(account), writable(destination), signerReadonly(owner)],
    data: Uint8Array.from([9]),
  };
}

export function token2022Instruction(code: number, accounts: string[]): InstructionSpec {
  return {
    programId: TOKEN_2022_PROGRAM_ID,
    accounts: accounts.map(writable),
    data: Uint8Array.from([code]),
  };
}

export function associatedTokenCreateIdempotent(payer: string, associatedAccount: string, owner: string, mint: string): InstructionSpec {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    accounts: [
      signerWritable(payer),
      writable(associatedAccount),
      readonlyAccount(owner),
      readonlyAccount(mint),
      readonlyAccount(SYSTEM_PROGRAM_ID),
      readonlyAccount(TOKEN_PROGRAM_ID),
    ],
    data: Uint8Array.from([1]),
  };
}

export function computeUnitLimit(units: number): InstructionSpec {
  return { programId: COMPUTE_BUDGET_PROGRAM_ID, accounts: [], data: computeBudgetLimitData(units) };
}

export function computeUnitPrice(microLamports: bigint): InstructionSpec {
  return { programId: COMPUTE_BUDGET_PROGRAM_ID, accounts: [], data: computeBudgetPriceData(microLamports) };
}

export function memo(text: string): InstructionSpec {
  return { programId: MEMO_PROGRAM_ID, accounts: [], data: new TextEncoder().encode(text) };
}

export function unknownProgramCall(programId: string, accounts: string[]): InstructionSpec {
  return { programId, accounts: accounts.map(writable), data: Uint8Array.from([1, 2, 3]) };
}

export const MANDATE_DISCRIMINATORS = {
  spend: "f2cdff5765d9f539",
  revoke: "fc618c77432bb16c",
  rotate: "b65b936b9b2f96b0",
  update: "5925893c4b4630c2",
} as const;

export function mandateSpend(agent: string, mandate: string, amount: bigint, toolId: bigint, nonce: bigint): InstructionSpec {
  return {
    programId: MANDATE_PROGRAM_ID,
    accounts: [signerReadonly(agent), writable(mandate)],
    data: mandateInstructionData(MANDATE_DISCRIMINATORS.spend, [
      ...littleEndian(amount, 8),
      ...littleEndian(toolId, 8),
      ...littleEndian(nonce, 8),
    ]),
  };
}

export function mandateRevoke(signer: string, mandate: string): InstructionSpec {
  return {
    programId: MANDATE_PROGRAM_ID,
    accounts: [signerReadonly(signer), writable(mandate)],
    data: mandateInstructionData(MANDATE_DISCRIMINATORS.revoke, []),
  };
}

export function mandateRotateAgent(owner: string, mandate: string, newAgent: string): InstructionSpec {
  return {
    programId: MANDATE_PROGRAM_ID,
    accounts: [signerReadonly(owner), writable(mandate)],
    data: mandateInstructionData(MANDATE_DISCRIMINATORS.rotate, addressToBytes(newAgent)),
  };
}
