import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EmptyState } from "@/components/States";
import { REPOSITORY_PROOF_COMMANDS } from "@/lib/constants";
import { loadVerificationDocument } from "@/lib/verification";

export const metadata: Metadata = { title: "Proofs" };

export default function ProofsPage(): ReactElement {
  const document = loadVerificationDocument();
  return (
    <div className="stack">
      <header className="page-header">
        <h1>Proofs</h1>
        <p className="page-lead">The claims Selvedge makes are checked by tools you can run yourself. This page renders the verification record kept with the source.</p>
      </header>
      {document === null ? (
        <EmptyState title="No verification record published yet" icon="proofs">
          The record is written when the proof runs finish. Until then, the commands below reproduce each check from the repository.
        </EmptyState>
      ) : (
        <article className="prose" aria-label="Verification record" dangerouslySetInnerHTML={{ __html: document.html }} />
      )}
      <section className="stack" aria-labelledby="reproduce-heading" style={{ gap: "var(--space-3)" }}>
        <h2 id="reproduce-heading">Reproduce it</h2>
        {REPOSITORY_PROOF_COMMANDS.map((entry) => (
          <div key={entry.command} className="stack" style={{ gap: "var(--space-2)" }}>
            <p>{entry.label}</p>
            <pre className="command" tabIndex={0}>{entry.command}</pre>
          </div>
        ))}
      </section>
    </div>
  );
}
