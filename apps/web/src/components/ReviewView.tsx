import type { ReactElement } from "react";
import type { ReviewResult } from "@selvedge/engine";
import { VerdictBadge } from "./Badges";

const NOTICE_CLASS = {
  safe: "notice notice-safe",
  caution: "notice notice-caution",
  danger: "notice notice-danger",
} as const;

export function ReviewView({ review }: { readonly review: ReviewResult }): ReactElement {
  const { assessment, decoded, simulation, explanation } = review;
  const [headline, ...detailLines] = explanation.split("\n");
  return (
    <section className="stack" aria-label="Transaction review">
      <div className={NOTICE_CLASS[assessment.verdict]} role="status">
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          <div className="cluster">
            <VerdictBadge verdict={assessment.verdict} />
            <span className="muted amount">Risk score {assessment.score} of 100</span>
          </div>
          <p>
            <strong>{headline}</strong>
          </p>
          {detailLines.length > 0 ? <p className="explanation">{detailLines.join("\n")}</p> : null}
        </div>
      </div>

      {assessment.findings.length > 0 ? (
        <div className="stack" style={{ gap: "var(--space-3)" }}>
          <h3>Findings</h3>
          <ul className="review-list">
            {assessment.findings.map((finding, findingIndex) => (
              <li key={`${finding.ruleId}-${findingIndex}`} data-severity={finding.severity}>
                <strong>{finding.title}</strong> <span className="mono muted">{finding.ruleId}</span>
                <p>{finding.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="stack" style={{ gap: "var(--space-3)" }}>
        <h3>Decoded instructions</h3>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table>
            <caption className="visually-hidden">Instructions in this transaction</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Program</th>
                <th scope="col">Action</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {decoded.instructions.map((instruction, instructionIndex) => (
                <tr key={`${instruction.programId}-${instructionIndex}`}>
                  <td className="numeric">{instructionIndex + 1}</td>
                  <td>{instruction.programLabel}</td>
                  <td className="mono">{instruction.kind}</td>
                  <td className="mono" style={{ overflowWrap: "anywhere" }}>
                    {Object.entries(instruction.details)
                      .map(([name, value]) => `${name}=${String(value)}`)
                      .join(" ") || "none"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">
          {decoded.version === "legacy" ? "Legacy" : "Version 0"} transaction, fee payer <span className="mono">{decoded.feePayer}</span>
          {simulation === null ? ", not simulated." : simulation.succeeded ? ", simulation succeeded." : ", simulation failed."}
        </p>
      </div>
    </section>
  );
}
