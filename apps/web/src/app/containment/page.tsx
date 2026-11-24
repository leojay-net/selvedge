import type { Metadata } from "next";
import type { ReactElement } from "react";
import { EmptyState, ErrorState } from "@/components/States";
import { DEFAULT_EXPLORER_CLUSTER } from "@/lib/constants";
import { GATE_LABELS, fetchContainmentLog, type ContainmentEntry } from "@/lib/containment";

export const metadata: Metadata = { title: "Containment" };
export const dynamic = "force-dynamic";

export default async function ContainmentPage(): Promise<ReactElement> {
  const result = await fetchContainmentLog();
  return (
    <div className="stack">
      <header className="page-header">
        <h1>Containment</h1>
        <p className="page-lead">Every time an agent tried something outside its limits and a gate refused it, the refusal is recorded here with the gate that stopped it.</p>
      </header>
      {result.state === "unconfigured" ? (
        <EmptyState title="No runtime connected" icon="plug">
          Set SELVEDGE_RUNTIME_URL to the agent runtime and its refusals will be listed here.
        </EmptyState>
      ) : null}
      {result.state === "unreachable" ? <ErrorState title="The runtime could not be reached">{result.reason}</ErrorState> : null}
      {result.state === "ready" && result.entries.length === 0 ? (
        <EmptyState title="Nothing contained yet" icon="containment">
          The runtime is connected and no agent has been refused so far.
        </EmptyState>
      ) : null}
      {result.state === "recorded" ? (
        <p className="page-lead">
          No live runtime is connected. These are the refusals from a recorded run on Solana devnet ({result.recordedAt}); each transaction link opens the public explorer.
        </p>
      ) : null}
      {(result.state === "ready" || result.state === "recorded") && result.entries.length > 0 ? (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Scrollable table">
          <table>
            <caption className="visually-hidden">Refused agent actions</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Agent</th>
                <th scope="col">Attempt</th>
                <th scope="col">Stopped by</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="numeric">{entry.timestamp}</td>
                  <td>{entry.agent}</td>
                  <td>{entry.attempt}</td>
                  <td>
                    <span className="badge badge-danger">{GATE_LABELS[entry.gate]}</span>
                  </td>
                  <td>
                    {entry.reason}
                    <SignatureLink entry={entry} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function SignatureLink({ entry }: { readonly entry: ContainmentEntry }): ReactElement | null {
  if (entry.signature === undefined) return null;
  const cluster = process.env.NEXT_PUBLIC_EXPLORER_CLUSTER ?? DEFAULT_EXPLORER_CLUSTER;
  return (
    <>
      {" "}
      <a href={`https://explorer.solana.com/tx/${entry.signature}?cluster=${cluster}`} rel="noreferrer" target="_blank">
        View transaction
      </a>
    </>
  );
}
