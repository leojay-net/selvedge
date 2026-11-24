import { NextResponse } from "next/server";
import { EngineError, MANDATE_PROGRAM_ID, reviewTransaction } from "@selvedge/engine";
import { errorResponse, rateLimitFailure, readLimitedJson } from "@/lib/apiGuards";
import { serverRpcUrl } from "@/lib/env";
import { reviewRequestSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const limited = rateLimitFailure(request);
  if (limited !== null) return limited;
  const body = await readLimitedJson(request);
  if (!body.ok) return body.response;
  const parsed = reviewRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    return errorResponse(400, "invalid_request", "The review request is not valid.", parsed.error.issues.map((issue) => issue.message));
  }
  try {
    const result = await reviewTransaction({
      transactionBase64: parsed.data.transactionBase64,
      context: { walletAddresses: parsed.data.walletAddresses, knownAddresses: [MANDATE_PROGRAM_ID], mintInfo: [] },
      rpcUrl: parsed.data.simulate ? serverRpcUrl() : null,
    });
    return NextResponse.json(result);
  } catch (caught) {
    if (caught instanceof EngineError) {
      const status = caught.code === "transaction_parse_failed" ? 422 : 502;
      return errorResponse(status, caught.code, caught.message, caught.context);
    }
    return errorResponse(500, "review_failed", "The transaction could not be reviewed.");
  }
}
