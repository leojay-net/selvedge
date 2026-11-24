export const MANDATE_PROGRAM_ADDRESS = "DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd";
export const TOKEN_PROGRAM_ADDRESS = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const SYSTEM_PROGRAM_ADDRESS = "11111111111111111111111111111111";
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";
export const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const USDC_DECIMALS = 6;
export const MANDATE_SEED = "mandate";
export const ACCOUNT_DISCRIMINATOR_BYTES = 8;
export const MAX_ALLOWED_PROGRAMS = 4;
export const MAX_ALLOWED_PAYEES = 4;
export const MAX_ALLOWED_TOOLS = 8;

export const INSTRUCTION_DISCRIMINATORS = {
  createMandate: [230, 170, 158, 68, 33, 169, 16, 158],
  updateLimits: [89, 37, 137, 60, 75, 70, 48, 194],
  revokeMandate: [252, 97, 140, 119, 67, 43, 177, 108],
  rotateAgent: [182, 91, 147, 107, 155, 47, 150, 176],
  spend: [242, 205, 255, 87, 101, 217, 245, 57],
  closeMandate: [117, 87, 189, 5, 254, 125, 248, 180],
} as const;

export const MANDATE_ACCOUNT_DISCRIMINATOR = [113, 216, 98, 159, 185, 63, 55, 18] as const;
export const MANDATE_ERROR_CODE_OFFSET = 6000;
export const MANDATE_ERROR_NAMES = [
  "Revoked",
  "Expired",
  "UnauthorizedSigner",
  "StaleNonce",
  "ZeroAmount",
  "ProgramNotAllowed",
  "PayeeNotAllowed",
  "ToolNotAllowed",
  "CapExceeded",
  "ArithmeticOverflow",
  "InvalidCap",
  "InvalidPeriod",
  "InvalidExpiry",
  "InvalidAllowlist",
  "CapBelowSpent",
  "AlreadyRevoked",
  "InvalidAgent",
  "TokenAccountOwnerMismatch",
] as const;
