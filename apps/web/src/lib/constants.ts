export const DEFAULT_RPC_URL = "https://api.devnet.solana.com";
export const RPC_TIMEOUT_MILLISECONDS = 12_000;
export const RUNTIME_TIMEOUT_MILLISECONDS = 6_000;
export const RECENT_ACTIVITY_LIMIT = 8;
export const MAX_REVIEW_BASE64_LENGTH = 1_700;
export const MAX_REQUEST_BODY_BYTES = 4_096;
export const MAX_WALLET_ADDRESSES = 4;
export const RATE_LIMIT_WINDOW_MILLISECONDS = 60_000;
export const RATE_LIMIT_MAX_REQUESTS = 30;
export const RATE_LIMIT_MAX_TRACKED_CLIENTS = 5_000;
export const BASE58_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const DEFAULT_CHAIN = "solana:devnet";
export const DEFAULT_EXPLORER_CLUSTER = "devnet";
export const REVALIDATE_SECONDS = 15;
export const USDC_BASE_UNITS_PER_TOKEN = 1_000_000n;
export const SECONDS_PER_DAY = 86_400n;
export const REPOSITORY_PROOF_COMMANDS: ReadonlyArray<{ readonly label: string; readonly command: string }> = [
  { label: "Program tests (LiteSVM, positive and negative paths)", command: "cargo test -p selvedge-mandate" },
  { label: "Kani proofs of the policy logic", command: "tools/run-proofs.sh" },
  { label: "Engine and policy conformance vectors", command: "pnpm --filter @selvedge/engine test" },
];
