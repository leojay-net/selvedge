import { DEFAULT_RPC_URL } from "./constants";

export function serverRpcUrl(): string {
  const configured = process.env.SOLANA_RPC_URL;
  return configured !== undefined && configured.length > 0 ? configured : DEFAULT_RPC_URL;
}

export function runtimeBaseUrl(): string | null {
  const configured = process.env.SELVEDGE_RUNTIME_URL;
  if (configured === undefined || configured.length === 0) return null;
  return configured.replace(/\/+$/, "");
}
