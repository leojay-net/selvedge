import type { ReactElement } from "react";
import { formatUsdc, spentPercent } from "@/lib/format";

const HIGH_USAGE_PERCENT = 75;
const FULL_USAGE_PERCENT = 100;

interface SpendMeterProps {
  readonly spent: bigint;
  readonly cap: bigint;
}

export function SpendMeter({ spent, cap }: SpendMeterProps): ReactElement {
  const percent = spentPercent(spent, cap);
  const level = percent >= FULL_USAGE_PERCENT ? "full" : percent >= HIGH_USAGE_PERCENT ? "high" : "normal";
  return (
    <div className="meter">
      <div
        className="meter-track"
        role="progressbar"
        aria-label="Spent this period"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${formatUsdc(spent)} of ${formatUsdc(cap)} USDC`}
      >
        <div className="meter-fill" data-level={level} style={{ width: `${percent}%` }} />
      </div>
      <div className="meter-caption amount">
        <span>{formatUsdc(spent)} USDC spent</span>
        <span className="muted">of {formatUsdc(cap)} USDC</span>
      </div>
    </div>
  );
}
