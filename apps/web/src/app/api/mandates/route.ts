import { NextResponse } from "next/server";
import { errorResponse, rateLimitFailure } from "@/lib/apiGuards";
import { fetchAllMandates } from "@/lib/mandates";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const limited = rateLimitFailure(request);
  if (limited !== null) return limited;
  try {
    const mandates = await fetchAllMandates();
    return NextResponse.json({
      mandates: mandates.map((mandate) => ({
        ...mandate,
        mandateId: mandate.mandateId.toString(),
        periodCap: mandate.periodCap.toString(),
        periodSeconds: mandate.periodSeconds.toString(),
        periodStart: mandate.periodStart.toString(),
        spentInPeriod: mandate.spentInPeriod.toString(),
        expiry: mandate.expiry.toString(),
        nonce: mandate.nonce.toString(),
        allowedTools: mandate.allowedTools.map((tool) => tool.toString()),
      })),
    });
  } catch {
    return errorResponse(502, "chain_unavailable", "Mandate accounts could not be read from the chain.");
  }
}
