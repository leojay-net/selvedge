import { randomBytes } from "node:crypto";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  partiallySignTransactionMessageWithSigners,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import type { PaymentPayloadResult, PaymentRequirements, SchemeNetworkClient } from "@x402/core/types";
import { deriveAssociatedTokenAddress, spendInstruction, type SolanaRpc } from "@selvedge/sdk";
import {
  COMPUTE_BUDGET_LIMIT_CODE,
  COMPUTE_BUDGET_PRICE_CODE,
  COMPUTE_BUDGET_PROGRAM_ADDRESS,
  MEMO_NONCE_BYTES,
  MEMO_PROGRAM_ADDRESS,
  PAYMENT_COMPUTE_UNIT_LIMIT,
  PAYMENT_COMPUTE_UNIT_PRICE_MICROLAMPORTS,
  STUDIO_TOOL_ID,
} from "../constants.js";
import { RuntimeError } from "../errors.js";

export class PaymentRequirementsRejected extends RuntimeError {
  constructor(reason: string, context: Readonly<Record<string, string | number | boolean | null>> = {}) {
    super("payment_requirements_rejected", reason, context);
  }
}

export interface MandatePaymentSchemeConfig {
  readonly rpc: SolanaRpc;
  readonly agentSigner: TransactionSigner;
  readonly mandateAddress: string;
  readonly mintAddress: string;
  readonly ownerTokenAccount: string;
  readonly toolId?: bigint;
  readonly readMandateNonce: () => Promise<bigint>;
  readonly maximumAmount: bigint;
}

function littleEndian(value: bigint, byteLength: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  for (let byteIndex = 0; byteIndex < byteLength; byteIndex += 1) {
    bytes.push(Number(remaining & 0xffn));
    remaining >>= 8n;
  }
  return bytes;
}

function computeBudgetInstructions(): Instruction[] {
  const programAddress = address(COMPUTE_BUDGET_PROGRAM_ADDRESS);
  return [
    { programAddress, data: Uint8Array.from([COMPUTE_BUDGET_LIMIT_CODE, ...littleEndian(BigInt(PAYMENT_COMPUTE_UNIT_LIMIT), 4)]) },
    { programAddress, data: Uint8Array.from([COMPUTE_BUDGET_PRICE_CODE, ...littleEndian(PAYMENT_COMPUTE_UNIT_PRICE_MICROLAMPORTS, 8)]) },
  ];
}

function memoInstruction(memoText: string): Instruction {
  return { programAddress: address(MEMO_PROGRAM_ADDRESS), data: new TextEncoder().encode(memoText) };
}

function attachSigner(instruction: Instruction, signer: TransactionSigner): Instruction {
  return {
    ...instruction,
    accounts: (instruction.accounts ?? []).map((meta) =>
      meta.address === signer.address && (meta.role === AccountRole.READONLY_SIGNER || meta.role === AccountRole.WRITABLE_SIGNER)
        ? { ...meta, signer }
        : meta,
    ),
  } as Instruction;
}

function readExtraString(requirements: PaymentRequirements, fieldName: string): string | undefined {
  const value = requirements.extra?.[fieldName];
  return typeof value === "string" ? value : undefined;
}

export class MandatePaymentScheme implements SchemeNetworkClient {
  readonly scheme = "exact";

  constructor(private readonly config: MandatePaymentSchemeConfig) {}

  async createPaymentPayload(x402Version: number, requirements: PaymentRequirements): Promise<PaymentPayloadResult> {
    const amount = BigInt(requirements.amount);
    if (requirements.asset !== this.config.mintAddress) {
      throw new PaymentRequirementsRejected("The payment asset is not the mandate's mint", {
        requested: requirements.asset,
        mandateMint: this.config.mintAddress,
      });
    }
    if (amount > this.config.maximumAmount) {
      throw new PaymentRequirementsRejected("The price exceeds the amount this run may spend", {
        price: requirements.amount,
        maximum: this.config.maximumAmount.toString(),
      });
    }
    const feePayerText = readExtraString(requirements, "feePayer");
    if (feePayerText === undefined) {
      throw new PaymentRequirementsRejected("The payment requirements carry no fee payer");
    }
    const payeeTokenAccount = await deriveAssociatedTokenAddress(requirements.payTo, requirements.asset);
    const nonce = await this.config.readMandateNonce();
    const spend = attachSigner(
      spendInstruction({
        agentAddress: this.config.agentSigner.address,
        mandateAddress: this.config.mandateAddress,
        mintAddress: this.config.mintAddress,
        ownerTokenAccount: this.config.ownerTokenAccount,
        payeeTokenAccount,
        amount,
        toolId: this.config.toolId ?? STUDIO_TOOL_ID,
        expectedNonce: nonce,
      }),
      this.config.agentSigner,
    );
    const memoText = readExtraString(requirements, "memo") ?? randomBytes(MEMO_NONCE_BYTES).toString("hex");
    const recentBlockhash = readExtraString(requirements, "recentBlockhash");
    const lifetime =
      recentBlockhash === undefined
        ? (await this.config.rpc.getLatestBlockhash({ commitment: "confirmed" }).send()).value
        : { blockhash: recentBlockhash as Blockhash, lastValidBlockHeight: 0n };
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (partialMessage) => setTransactionMessageFeePayer(feePayerText as Address, partialMessage),
      (partialMessage) => setTransactionMessageLifetimeUsingBlockhash(lifetime, partialMessage),
      (partialMessage) =>
        appendTransactionMessageInstructions([...computeBudgetInstructions(), spend, memoInstruction(memoText)], partialMessage),
    );
    const partiallySigned = await partiallySignTransactionMessageWithSigners(message);
    return { x402Version, payload: { transaction: getBase64EncodedWireTransaction(partiallySigned) } };
  }
}

export function createRpc(rpcUrl: string): SolanaRpc {
  return createSolanaRpc(rpcUrl);
}
