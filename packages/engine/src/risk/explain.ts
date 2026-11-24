import { formatAssetAmount } from "./labels.js";
import type { AssetDelta, ReviewContext, RiskAssessment, RiskVerdict } from "../types.js";

const VERDICT_HEADLINES: Readonly<Record<RiskVerdict, string>> = {
  danger: "Do not sign this transaction.",
  caution: "Review this transaction carefully before signing.",
  safe: "No risks were found in this transaction.",
};

function describeWalletMovements(deltas: readonly AssetDelta[], context: ReviewContext): string[] {
  const lines: string[] = [];
  for (const delta of deltas) {
    if (!context.walletAddresses.includes(delta.owner)) continue;
    const change = BigInt(delta.change);
    if (change === 0n) continue;
    const verb = change < 0n ? "You send" : "You receive";
    const subject = formatAssetAmount(delta.asset, change);
    lines.push(`${verb} ${subject}.`);
  }
  return lines;
}

export function explainReview(
  assessment: RiskAssessment,
  deltas: readonly AssetDelta[],
  context: ReviewContext,
): string {
  const lines: string[] = [VERDICT_HEADLINES[assessment.verdict]];
  lines.push(...describeWalletMovements(deltas, context));
  for (const finding of assessment.findings) {
    lines.push(`${finding.title}: ${finding.detail}`);
  }
  return lines.join("\n");
}
