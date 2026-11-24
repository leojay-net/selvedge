import type { ReactElement } from "react";
import type { RiskVerdict } from "@selvedge/engine";
import type { MandateStatus } from "@/lib/mandates";

const VERDICT_LABELS: Readonly<Record<RiskVerdict, string>> = {
  safe: "Safe",
  caution: "Caution",
  danger: "Danger",
};
const VERDICT_CLASSES: Readonly<Record<RiskVerdict, string>> = {
  safe: "badge badge-safe",
  caution: "badge badge-caution",
  danger: "badge badge-danger",
};
const STATUS_CLASSES: Readonly<Record<MandateStatus, string>> = {
  active: "badge badge-safe",
  expired: "badge badge-caution",
  revoked: "badge badge-danger",
};
const STATUS_LABELS: Readonly<Record<MandateStatus, string>> = {
  active: "Active",
  expired: "Expired",
  revoked: "Revoked",
};

export function VerdictBadge({ verdict }: { readonly verdict: RiskVerdict }): ReactElement {
  return <span className={VERDICT_CLASSES[verdict]}>{VERDICT_LABELS[verdict]}</span>;
}

export function StatusBadge({ status }: { readonly status: MandateStatus }): ReactElement {
  return <span className={STATUS_CLASSES[status]}>{STATUS_LABELS[status]}</span>;
}
