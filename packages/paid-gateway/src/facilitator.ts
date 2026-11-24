import { readFileSync } from "node:fs";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";
import { ExactSvmScheme } from "@x402/svm/exact/facilitator";
import { toFacilitatorSvmSigner } from "@x402/svm";
import type { GatewayConfig } from "./config.js";

const SMART_WALLET_MAX_COMPUTE_UNITS = 400_000;
const SMART_WALLET_MAX_PRIORITY_FEE_MICROLAMPORTS = 50_000;

export async function createFacilitatorClient(config: GatewayConfig): Promise<FacilitatorClient> {
  const secretKeyBytes = Uint8Array.from(JSON.parse(readFileSync(config.FACILITATOR_KEYPAIR_PATH, "utf8")) as number[]);
  const feePayerSigner = await createKeyPairSignerFromBytes(secretKeyBytes);
  const svmSigner = toFacilitatorSvmSigner(feePayerSigner, { defaultRpcUrl: config.SOLANA_RPC_URL });
  const scheme = new ExactSvmScheme(svmSigner, undefined, {
    enableSmartWalletVerification: true,
    smartWalletAllowedPrograms: [config.MANDATE_PROGRAM_ID],
    smartWalletMaxComputeUnits: SMART_WALLET_MAX_COMPUTE_UNITS,
    smartWalletMaxPriorityFeeMicroLamports: SMART_WALLET_MAX_PRIORITY_FEE_MICROLAMPORTS,
  });
  const facilitator = new x402Facilitator().register(config.X402_NETWORK as `${string}:${string}`, scheme);
  return {
    verify: (paymentPayload, paymentRequirements) => facilitator.verify(paymentPayload, paymentRequirements),
    settle: (paymentPayload, paymentRequirements) => facilitator.settle(paymentPayload, paymentRequirements),
    getSupported: async () => {
      const supported = facilitator.getSupported();
      return {
        ...supported,
        kinds: supported.kinds.map((kind) => ({ ...kind, network: kind.network as `${string}:${string}` })),
      };
    },
  };
}
