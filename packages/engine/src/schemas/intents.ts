import { z } from "zod";
import { MAX_U64 } from "../constants.js";

export const INTENT_SCHEMA_VERSION = 1;
const MAX_NOTE_LENGTH = 200;
const MAX_STUDIO_PROMPT_LENGTH = 2000;
const BASE58_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UNSIGNED_INTEGER_PATTERN = /^(0|[1-9][0-9]{0,19})$/;

const addressSchema = z.string().regex(BASE58_ADDRESS_PATTERN, "must be a base58 Solana address");
const unsignedAmountSchema = z
  .string()
  .regex(UNSIGNED_INTEGER_PATTERN, "must be a base-10 unsigned integer string")
  .refine(
    (value) => UNSIGNED_INTEGER_PATTERN.test(value) && BigInt(value) > 0n && BigInt(value) <= MAX_U64,
    "must fit in u64 and be positive",
  );

export const transferIntentSchema = z.strictObject({
  version: z.literal(INTENT_SCHEMA_VERSION),
  kind: z.literal("transfer"),
  asset: z.union([z.literal("SOL"), addressSchema]),
  recipient: addressSchema,
  amount: unsignedAmountSchema,
  note: z.string().max(MAX_NOTE_LENGTH).optional(),
});

export const swapIntentSchema = z.strictObject({
  version: z.literal(INTENT_SCHEMA_VERSION),
  kind: z.literal("swap"),
  inputAsset: addressSchema,
  outputAsset: addressSchema,
  inputAmount: unsignedAmountSchema,
  maximumSlippageBasisPoints: z.number().int().min(1).max(1000),
});

export const mandateOperationIntentSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    version: z.literal(INTENT_SCHEMA_VERSION),
    kind: z.literal("mandate"),
    operation: z.literal("revoke"),
    mandate: addressSchema,
  }),
  z.strictObject({
    version: z.literal(INTENT_SCHEMA_VERSION),
    kind: z.literal("mandate"),
    operation: z.literal("rotate-agent"),
    mandate: addressSchema,
    newAgent: addressSchema,
  }),
]);

export const studioJobIntentSchema = z.strictObject({
  version: z.literal(INTENT_SCHEMA_VERSION),
  kind: z.literal("studio-job"),
  prompt: z.string().min(1).max(MAX_STUDIO_PROMPT_LENGTH),
  maximumMicroUsdc: unsignedAmountSchema,
});

export const intentSchema = z.union([
  transferIntentSchema,
  swapIntentSchema,
  mandateOperationIntentSchema,
  studioJobIntentSchema,
]);

export type Intent = z.infer<typeof intentSchema>;

export function exportIntentJsonSchema(): unknown {
  return z.toJSONSchema(intentSchema);
}
