import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactElement } from "react";
import { StatusBadge } from "@/components/Badges";
import { RevokePanel } from "@/components/RevokePanel";
import { SpendMeter } from "@/components/SpendMeter";
import { ErrorState } from "@/components/States";
import { formatDuration, formatTimestamp, shortAddress } from "@/lib/format";
import { fetchMandate, mandateStatus } from "@/lib/mandates";
import { addressSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

interface MandatePageProps {
  readonly params: Promise<{ address: string }>;
}

export async function generateMetadata({ params }: MandatePageProps): Promise<Metadata> {
  const { address } = await params;
  return { title: `Mandate ${shortAddress(address)}` };
}

function AddressList({ label, addresses }: { readonly label: string; readonly addresses: readonly string[] }): ReactElement {
  return (
    <div className="stack" style={{ gap: "var(--space-2)" }}>
      <h3>{label}</h3>
      {addresses.length === 0 ? (
        <p className="muted">None allowed.</p>
      ) : (
        <ul className="chip-list">
          {addresses.map((address) => (
            <li key={address} className="chip" title={address}>
              {shortAddress(address)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function MandateDetailPage({ params }: MandatePageProps): Promise<ReactElement> {
  const { address } = await params;
  if (!addressSchema.safeParse(address).success) notFound();

  let mandate;
  try {
    mandate = await fetchMandate(address);
  } catch {
    return (
      <div className="stack">
        <h1>Mandate</h1>
        <ErrorState title="The mandate could not be read" action={<Link href="/agents">Back to agents</Link>}>
          The devnet RPC did not answer. Reload the page to try again.
        </ErrorState>
      </div>
    );
  }
  if (mandate === null) notFound();

  const now = BigInt(Math.floor(Date.now() / 1000));
  const status = mandateStatus(mandate, now);

  return (
    <div className="stack">
      <header className="page-header">
        <Link href="/agents">Agents</Link>
        <div className="cluster">
          <h1>Mandate {mandate.mandateId.toString()}</h1>
          <StatusBadge status={status} />
        </div>
        <p className="mono muted" style={{ overflowWrap: "anywhere" }}>
          {mandate.address}
        </p>
      </header>

      <section className="card" aria-labelledby="spend-heading">
        <h2 id="spend-heading">Spending</h2>
        <SpendMeter spent={mandate.spentInPeriod} cap={mandate.periodCap} />
        <dl className="definition-list">
          <dt>Period</dt>
          <dd>{formatDuration(mandate.periodSeconds)}</dd>
          <dt>Period started</dt>
          <dd>{formatTimestamp(mandate.periodStart)}</dd>
          <dt>Expires</dt>
          <dd>{formatTimestamp(mandate.expiry)}</dd>
          <dt>Nonce</dt>
          <dd className="numeric">{mandate.nonce.toString()}</dd>
        </dl>
      </section>

      <section className="card" aria-labelledby="parties-heading">
        <h2 id="parties-heading">Parties</h2>
        <dl className="definition-list">
          <dt>Owner</dt>
          <dd className="mono">{mandate.owner}</dd>
          <dt>Agent</dt>
          <dd className="mono">{mandate.agent}</dd>
          <dt>Security authority</dt>
          <dd className="mono">{mandate.securityAuthority}</dd>
          <dt>Mint</dt>
          <dd className="mono">{mandate.mint}</dd>
        </dl>
      </section>

      <section className="card" aria-labelledby="allow-heading">
        <h2 id="allow-heading">Allowlists</h2>
        <AddressList label="Programs" addresses={mandate.allowedPrograms} />
        <AddressList label="Payees" addresses={mandate.allowedPayees} />
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          <h3>Tools</h3>
          {mandate.allowedTools.length === 0 ? (
            <p className="muted">None allowed.</p>
          ) : (
            <ul className="chip-list">
              {mandate.allowedTools.map((tool) => (
                <li key={tool.toString()} className="chip">
                  tool {tool.toString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <RevokePanel
        mandateAddress={mandate.address}
        ownerAddress={mandate.owner}
        securityAuthorityAddress={mandate.securityAuthority}
        revoked={mandate.revoked}
      />
    </div>
  );
}
