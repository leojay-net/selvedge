import Link from "next/link";
import type { ReactElement } from "react";
import { MANDATE_PROGRAM_ADDRESS } from "@selvedge/sdk";
import { CountUp } from "@/components/CountUp";
import { GateDiagram } from "@/components/GateDiagram";
import { Reveal } from "@/components/Reveal";
import { ErrorState } from "@/components/States";
import { fetchAllMandates, fetchProgramDeployment, mandateStatus } from "@/lib/mandates";

export const dynamic = "force-dynamic";

const MICRO_UNITS_PER_USDC = 1_000_000;

const GATES: ReadonlyArray<{ readonly title: string; readonly body: string }> = [
  { title: "Engine policy", body: "A deterministic pre-check mirrors the on-chain rules so an agent gets fast, typed feedback before anything is built." },
  { title: "Mandate program", body: "The Solana program is the authority: cap per period, allowlisted payees and tools, expiry, nonce and revocation." },
  { title: "Biometric veto", body: "Anything the risk engine marks dangerous needs the person, through the Seed Vault, before it is signed." },
];

async function loadOverview() {
  try {
    const [mandates, deployment] = await Promise.all([fetchAllMandates(), fetchProgramDeployment()]);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const active = mandates.filter((mandate) => mandateStatus(mandate, now) === "active");
    const totalSpent = mandates.reduce((sum, mandate) => sum + mandate.spentInPeriod, 0n);
    return { ok: true as const, mandates, active, totalSpent, deployment };
  } catch {
    return { ok: false as const };
  }
}

export default async function OverviewPage(): Promise<ReactElement> {
  const overview = await loadOverview();
  return (
    <div className="stack">
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="eyebrow hero-step" style={{ ["--step" as string]: 0 }}>Agent platform for Solana Mobile</p>
          <h1 id="hero-heading" className="hero-step" style={{ ["--step" as string]: 1 }}>
            Agents act only inside a mandate.
          </h1>
          <p className="page-lead hero-step" style={{ ["--step" as string]: 2 }}>
            Every agent spends under an on-chain mandate whose limits are proven with Kani. Security agents decode, simulate and explain each transaction before you sign.
          </p>
          <div className="hero-actions hero-step" style={{ ["--step" as string]: 3 }}>
            <Link href="/agents" className="button">
              See live mandates
            </Link>
            <Link href="/activity" className="button button-secondary">
              Review a transaction
            </Link>
            <Link href="/download" className="button button-secondary">
              Get the app
            </Link>
          </div>
        </div>
        <GateDiagram />
      </section>

      <Reveal as="section" className="stack">
        <h2 id="live-heading">Live on devnet</h2>
        {overview.ok ? (
          <div className="card stat-card" aria-labelledby="live-heading">
            <div className="stat-grid">
              <div className="stat">
                <span className="muted">Mandates</span>
                <span className="stat-value">
                  <CountUp value={overview.mandates.length} />
                </span>
              </div>
              <div className="stat">
                <span className="muted">Active</span>
                <span className="stat-value">
                  <CountUp value={overview.active.length} />
                </span>
              </div>
              <div className="stat">
                <span className="muted">Spent this period</span>
                <span className="stat-value">
                  <CountUp value={Number(overview.totalSpent) / MICRO_UNITS_PER_USDC} decimals={3} suffix=" USDC" />
                </span>
              </div>
              <div className="stat">
                <span className="muted">Program</span>
                <span className="stat-value status-line">
                  <span className={overview.deployment?.executable === true ? "status-dot status-dot-live" : "status-dot"} aria-hidden="true" />
                  {overview.deployment?.executable === true ? "Deployed" : "Not found"}
                </span>
              </div>
            </div>
            <p className="muted">
              Program <code>{MANDATE_PROGRAM_ADDRESS}</code>
            </p>
          </div>
        ) : (
          <ErrorState title="The chain could not be read">
            The devnet RPC did not answer. The rest of the dashboard still works, and this page will recover on reload.
          </ErrorState>
        )}
      </Reveal>

      <section aria-labelledby="gates-heading" className="stack" style={{ gap: "var(--space-3)" }}>
        <Reveal>
          <h2 id="gates-heading">Three independent gates</h2>
        </Reveal>
        <ol className="steps">
          {GATES.map((gate, gateIndex) => (
            <Reveal as="li" order={gateIndex} key={gate.title}>
              <h3>{gate.title}</h3>
              <p>{gate.body}</p>
            </Reveal>
          ))}
        </ol>
      </section>
    </div>
  );
}
