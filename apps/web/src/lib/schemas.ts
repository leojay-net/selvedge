import { z } from "zod";
import { BASE58_ADDRESS_PATTERN, MAX_REVIEW_BASE64_LENGTH, MAX_WALLET_ADDRESSES } from "./constants";

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export const addressSchema = z.string().regex(BASE58_ADDRESS_PATTERN, "must be a base58 Solana address");

export const reviewRequestSchema = z.strictObject({
  transactionBase64: z.string().min(1).max(MAX_REVIEW_BASE64_LENGTH).regex(BASE64_PATTERN, "must be base64"),
  walletAddresses: z.array(addressSchema).max(MAX_WALLET_ADDRESSES).default([]),
  simulate: z.boolean().default(true),
});

export type ReviewRequestBody = z.infer<typeof reviewRequestSchema>;
