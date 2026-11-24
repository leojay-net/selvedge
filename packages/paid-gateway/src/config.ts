import { z } from "zod";

const DEFAULT_GATEWAY_PORT = 8720;
const DEVNET_NETWORK = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
const DEFAULT_STUDIO_URL = "http://127.0.0.1:8710";
const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
const MINIMUM_TOKEN_LENGTH = 16;

const environmentSchema = z.object({
  GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(DEFAULT_GATEWAY_PORT),
  SOLANA_RPC_URL: z.url().default(DEFAULT_RPC_URL),
  X402_NETWORK: z.string().regex(/^solana:[A-Za-z0-9]+$/).default(DEVNET_NETWORK),
  FACILITATOR_KEYPAIR_PATH: z.string().min(1),
  MERCHANT_ADDRESS: z.string().min(32),
  PAYMENT_ASSET_MINT: z.string().min(32),
  MANDATE_PROGRAM_ID: z.string().min(32),
  STUDIO_SERVICE_URL: z.url().default(DEFAULT_STUDIO_URL),
  STUDIO_INTERNAL_TOKEN: z.string().min(MINIMUM_TOKEN_LENGTH),
});

export type GatewayConfig = z.infer<typeof environmentSchema>;

export function loadGatewayConfig(environment: NodeJS.ProcessEnv): GatewayConfig {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
    throw new Error(`Invalid gateway environment: ${problems}`);
  }
  return parsed.data;
}
