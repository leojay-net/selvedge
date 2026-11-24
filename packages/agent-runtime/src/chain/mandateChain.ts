import { address, type TransactionSigner } from "@solana/kit";
import {
  TransactionFailedError,
  decodeMandateAccount,
  deriveAssociatedTokenAddress,
  revokeMandateInstruction,
  sendAndConfirm,
  spendInstruction,
  withRateLimitRetry,
  type MandateAccount,
  type SolanaRpc,
} from "@selvedge/sdk";
import { RuntimeError } from "../errors.js";
import type { SpendAttempt, SpendReceipt } from "../types.js";

export interface MandateChain {
  readMandate(): Promise<MandateAccount>;
  submitSpend(attempt: SpendAttempt, expectedNonce: bigint): Promise<SpendReceipt>;
  revoke(): Promise<SpendReceipt>;
}

export class ChainRefusal extends RuntimeError {
  readonly mandateErrorName: string | null;
  readonly signature: string | null;

  constructor(message: string, mandateErrorName: string | null, signature: string | null) {
    super("chain_refused", message, { mandateErrorName, signature });
    this.mandateErrorName = mandateErrorName;
    this.signature = signature;
  }
}

export interface SolanaMandateChainConfig {
  readonly rpc: SolanaRpc;
  readonly mandateAddress: string;
  readonly mintAddress: string;
  readonly ownerTokenAccount: string;
  readonly agentSigner: TransactionSigner;
  readonly securitySigner: TransactionSigner | null;
}

export class SolanaMandateChain implements MandateChain {
  constructor(private readonly config: SolanaMandateChainConfig) {}

  async readMandate(): Promise<MandateAccount> {
    const result = await withRateLimitRetry(() =>
      this.config.rpc.getAccountInfo(address(this.config.mandateAddress), { encoding: "base64", commitment: "confirmed" }).send(),
    );
    if (result.value === null) {
      throw new RuntimeError("mandate_missing", "The mandate account does not exist", { mandateAddress: this.config.mandateAddress });
    }
    const [encoded] = result.value.data as unknown as readonly [string, string];
    return decodeMandateAccount(this.config.mandateAddress, new Uint8Array(Buffer.from(encoded, "base64")));
  }

  async submitSpend(attempt: SpendAttempt, expectedNonce: bigint): Promise<SpendReceipt> {
    const payeeTokenAccount = await deriveAssociatedTokenAddress(attempt.payee, this.config.mintAddress);
    try {
      const signature = await sendAndConfirm({
        rpc: this.config.rpc,
        feePayer: this.config.agentSigner,
        skipPreflight: true,
        instructions: [
          spendInstruction({
            agentAddress: this.config.agentSigner.address,
            mandateAddress: this.config.mandateAddress,
            mintAddress: this.config.mintAddress,
            ownerTokenAccount: this.config.ownerTokenAccount,
            payeeTokenAccount,
            amount: attempt.amount,
            toolId: attempt.toolId,
            expectedNonce,
          }),
        ],
      });
      return { signature };
    } catch (caught) {
      if (caught instanceof TransactionFailedError) {
        throw new ChainRefusal(caught.message, caught.mandateErrorName, caught.signature);
      }
      throw caught;
    }
  }

  async revoke(): Promise<SpendReceipt> {
    if (this.config.securitySigner === null) {
      throw new RuntimeError("security_key_missing", "No security authority key is configured");
    }
    const signature = await sendAndConfirm({
      rpc: this.config.rpc,
      feePayer: this.config.securitySigner,
      instructions: [revokeMandateInstruction(this.config.securitySigner.address, this.config.mandateAddress)],
    });
    return { signature };
  }
}
