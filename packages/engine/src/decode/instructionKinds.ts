export const SYSTEM_INSTRUCTION_NAMES: Readonly<Record<number, string>> = {
  0: "create-account",
  1: "assign",
  2: "transfer",
  3: "create-account-with-seed",
  4: "advance-nonce",
  5: "withdraw-nonce",
  6: "initialize-nonce",
  7: "authorize-nonce",
  8: "allocate",
  9: "allocate-with-seed",
  10: "assign-with-seed",
  11: "transfer-with-seed",
  12: "upgrade-nonce",
};

export const TOKEN_INSTRUCTION_NAMES: Readonly<Record<number, string>> = {
  0: "initialize-mint",
  1: "initialize-account",
  2: "initialize-multisig",
  3: "transfer",
  4: "approve",
  5: "revoke",
  6: "set-authority",
  7: "mint-to",
  8: "burn",
  9: "close-account",
  10: "freeze-account",
  11: "thaw-account",
  12: "transfer-checked",
  13: "approve-checked",
  14: "mint-to-checked",
  15: "burn-checked",
  16: "initialize-account2",
  17: "sync-native",
  18: "initialize-account3",
  19: "initialize-multisig2",
  20: "initialize-mint2",
  21: "get-account-data-size",
  22: "initialize-immutable-owner",
  23: "amount-to-ui-amount",
  24: "ui-amount-to-amount",
  25: "initialize-mint-close-authority",
  26: "transfer-fee-extension",
  27: "confidential-transfer-extension",
  28: "default-account-state-extension",
  29: "reallocate",
  30: "memo-transfer-extension",
  31: "create-native-mint",
  32: "initialize-non-transferable-mint",
  33: "interest-bearing-mint-extension",
  34: "cpi-guard-extension",
  35: "initialize-permanent-delegate",
  36: "transfer-hook-extension",
  37: "confidential-transfer-fee-extension",
  38: "withdraw-excess-lamports",
  39: "metadata-pointer-extension",
  40: "group-pointer-extension",
  41: "group-member-pointer-extension",
};

export const TOKEN_AUTHORITY_TYPE_NAMES: Readonly<Record<number, string>> = {
  0: "mint-tokens",
  1: "freeze-account",
  2: "account-owner",
  3: "close-account",
};

export const ASSOCIATED_TOKEN_INSTRUCTION_NAMES: Readonly<Record<number, string>> = {
  0: "create",
  1: "create-idempotent",
  2: "recover-nested",
};

export const COMPUTE_BUDGET_INSTRUCTION_NAMES: Readonly<Record<number, string>> = {
  1: "request-heap-frame",
  2: "set-compute-unit-limit",
  3: "set-compute-unit-price",
  4: "set-loaded-accounts-data-size-limit",
};

export const TOKEN_INSTRUCTION_TRANSFER = 3;
export const TOKEN_INSTRUCTION_APPROVE = 4;
export const TOKEN_INSTRUCTION_SET_AUTHORITY = 6;
export const TOKEN_INSTRUCTION_TRANSFER_CHECKED = 12;
export const TOKEN_INSTRUCTION_APPROVE_CHECKED = 13;
export const TOKEN_INSTRUCTION_BURN = 8;
export const TOKEN_INSTRUCTION_BURN_CHECKED = 15;
export const TOKEN_INSTRUCTION_CLOSE_ACCOUNT = 9;
export const TOKEN_INSTRUCTION_MINT_TO = 7;
export const TOKEN_INSTRUCTION_MINT_TO_CHECKED = 14;

export const SYSTEM_INSTRUCTION_CREATE_ACCOUNT = 0;
export const SYSTEM_INSTRUCTION_ASSIGN = 1;
export const SYSTEM_INSTRUCTION_TRANSFER = 2;
export const SYSTEM_INSTRUCTION_ASSIGN_WITH_SEED = 10;
export const SYSTEM_INSTRUCTION_TRANSFER_WITH_SEED = 11;
export const SYSTEM_INSTRUCTION_WITHDRAW_NONCE = 5;

export const COMPUTE_BUDGET_SET_UNIT_LIMIT = 2;
export const COMPUTE_BUDGET_SET_UNIT_PRICE = 3;

export const MANDATE_INSTRUCTIONS: ReadonlyArray<{ name: string; discriminatorHex: string }> = [
  { name: "create-mandate", discriminatorHex: "e6aa9e4421a9109e" },
  { name: "update-limits", discriminatorHex: "5925893c4b4630c2" },
  { name: "revoke-mandate", discriminatorHex: "fc618c77432bb16c" },
  { name: "rotate-agent", discriminatorHex: "b65b936b9b2f96b0" },
  { name: "spend", discriminatorHex: "f2cdff5765d9f539" },
  { name: "close-mandate", discriminatorHex: "7557bd05fe7df8b4" },
];
