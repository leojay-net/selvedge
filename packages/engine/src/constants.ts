export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ASSOCIATED_TOKEN_PROGRAM_ID = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
export const LEGACY_MEMO_PROGRAM_ID = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";
export const ADDRESS_LOOKUP_TABLE_PROGRAM_ID = "AddressLookupTab1e1111111111111111111111111";
export const MANDATE_PROGRAM_ID = "DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd";

export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const NATIVE_ASSET = "SOL";

export const PUBLIC_KEY_BYTE_LENGTH = 32;
export const SIGNATURE_BYTE_LENGTH = 64;
export const VERSION_PREFIX_MASK = 0x7f;
export const VERSION_PREFIX_FLAG = 0x80;
export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const TOKEN_ACCOUNT_MINIMUM_LENGTH = 165;
export const TOKEN_ACCOUNT_MINT_OFFSET = 0;
export const TOKEN_ACCOUNT_OWNER_OFFSET = 32;
export const TOKEN_ACCOUNT_AMOUNT_OFFSET = 64;
export const MAX_U64 = 18_446_744_073_709_551_615n;

export const KNOWN_PROGRAM_LABELS: Readonly<Record<string, string>> = {
  [SYSTEM_PROGRAM_ID]: "System Program",
  [TOKEN_PROGRAM_ID]: "SPL Token",
  [TOKEN_2022_PROGRAM_ID]: "Token-2022",
  [ASSOCIATED_TOKEN_PROGRAM_ID]: "Associated Token Account",
  [COMPUTE_BUDGET_PROGRAM_ID]: "Compute Budget",
  [MEMO_PROGRAM_ID]: "Memo",
  [LEGACY_MEMO_PROGRAM_ID]: "Memo (legacy)",
  [ADDRESS_LOOKUP_TABLE_PROGRAM_ID]: "Address Lookup Table",
  [MANDATE_PROGRAM_ID]: "Selvedge Mandate",
};

export const KNOWN_ASSET_SYMBOLS: Readonly<Record<string, { symbol: string; decimals: number }>> = {
  [NATIVE_ASSET]: { symbol: "SOL", decimals: 9 },
  [DEVNET_USDC_MINT]: { symbol: "USDC", decimals: 6 },
  [MAINNET_USDC_MINT]: { symbol: "USDC", decimals: 6 },
};

export const RISK_RULESET_VERSION = "1.0.0";

export const RISK_THRESHOLDS = {
  unlimitedApprovalMinimumAmount: 1n << 63n,
  criticalDrainPermille: 900n,
  warningDrainPermille: 500n,
  newRecipientWarningLamports: 100_000_000n,
  newRecipientWarningTokenUnits: 100_000_000n,
  maximumComputeUnitLimit: 1_400_000,
  maximumComputeUnitPriceMicroLamports: 5_000_000n,
  maximumLookupTableSharePercent: 50,
  drainIgnoredNativeLamports: 10_000_000n,
} as const;

export const RISK_SCORE_WEIGHTS = {
  critical: 60,
  warning: 20,
  info: 0,
} as const;

export const RISK_SCORE_CAP = 100;
export const DANGER_SCORE_MINIMUM = 60;
export const CAUTION_SCORE_MINIMUM = 20;
export const PERMILLE_DENOMINATOR = 1000n;
export const PERCENT_DENOMINATOR = 100;

export const SIMULATION_TIMEOUT_MILLISECONDS = 15_000;
export const MAXIMUM_TRANSACTION_BYTES = 1232;
