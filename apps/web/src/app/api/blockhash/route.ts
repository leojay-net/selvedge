import { NextResponse } from "next/server";
import { errorResponse, rateLimitFailure } from "@/lib/apiGuards";
import { callRpc } from "@/lib/rpc";

export const dynamic = "force-dynamic";

interface LatestBlockhashResponse {
  readonly value: { readonly blockhash: string; readonly lastValidBlockHeight: number };
}

export async function GET(request: Request): Promise<NextResponse> {
  const limited = rateLimitFailure(request);
  if (limited !== null) return limited;
  try {
    const response = await callRpc<LatestBlockhashResponse>("getLatestBlockhash", [{ commitment: "confirmed" }]);
    return NextResponse.json({
      blockhash: response.value.blockhash,
      lastValidBlockHeight: response.value.lastValidBlockHeight,
    });
  } catch {
    return errorResponse(502, "chain_unavailable", "A recent blockhash could not be fetched.");
  }
}
