import Link from "next/link";
import type { Metadata } from "next";
import type { ReactElement } from "react";
import { StatusBadge } from "@/components/Badges";
import { SpendMeter } from "@/components/SpendMeter";
import { EmptyState, ErrorState } from "@/components/States";
import { formatDuration, shortAddress } from "@/lib/format";
import { fetchAllMandates, mandateStatus } from "@/lib/mandates";

export const metadata: Metadata = { title: "Agents" };
export const dynamic = "force-dynamic";

export default async function AgentsPage(): Promise<ReactElement> {
  let mandates;
  try {
    mandates = await fetchAllMandates();
  } catch {
    return (
      <div className="stack">
        <h1>Agents</h1>
        <ErrorState title="Mandates could not be loaded">The devnet RPC did not answer. Reload the page to try again.</ErrorState>
      </div>
    );
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  return (
    <div className="stack">
      <header className="page-header">
        <h1>Agents</h1>
        <p className="page-lead">Every agent runs under its own mandate account. State below is read directly from Solana devnet.</p>
      </header>
      {mandates.length === 0 ? (
        <EmptyState title="No mandates yet" icon="agents">
          No agent has been given a mandate on this program. Spawn an agent from the runtime and its mandate will appear here.
        </EmptyState>
      ) : (
        <ul className="grid" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {mandates.map((mandate) => (
            <li key={mandate.address}>
              <Link href={`/mandates/${mandate.address}`} className="card" style={{ height: "100%" }}>
                <div className="card-title-row">
                  <div>
                    <p className="eyebrow">Mandate {mandate.mandateId.toString()}</p>
                    <h2 className="mono" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-md)", lineHeight: "var(--line-md)" }}>
                      {shortAddress(mandate.address)}
                    </h2>
                  </div>
                  <StatusBadge status={mandateStatus(mandate, now)} />
                </div>
                <SpendMeter spent={mandate.spentInPeriod} cap={mandate.periodCap} />
                <p className="muted">
                  Agent <span className="mono">{shortAddress(mandate.agent)}</span>, resets every {formatDuration(mandate.periodSeconds)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
