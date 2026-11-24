import Link from "next/link";
import type { ReactElement } from "react";
import { MANDATE_PROGRAM_ADDRESS } from "@selvedge/sdk";
import { CountUp } from "@/components/CountUp";
import { GateDiagram } from "@/components/GateDiagram";
import { AttackGame } from "@/components/story/AttackGame";
import { InjectionScene } from "@/components/story/InjectionScene";
import { Reveal } from "@/components/Reveal";
import { ErrorState } from "@/components/States";
import { fetchAllMandates, fetchProgramDeployment, mandateStatus } from "@/lib/mandates";

export const dynamic = "force-dynamic";

const MICRO_UNITS_PER_USDC = 1_000_000;
const REPOSITORY_URL = "https://github.com/leojay-net/selvedge";
const REFUSAL_TRANSACTION_URL =
  "https://explorer.solana.com/tx/36RypxxEiK6LqetzAMrbGSeptL1ALHMPk9VL4ZwNiQvydMnd8FywbgVW7gxViwKZN8jPDMTdSTDucyXH8iJU77p?cluster=devnet";

const PROOF_FACTS: ReadonlyArray<{ readonly value: number; readonly label: string }> = [
  { value: 10, label: "Kani proofs on the program" },
  { value: 37, label: "program tests, positive and negative" },
  { value: 345, label: "engine tests" },
  { value: 324, label: "conformance vectors shared with Android" },
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
    <div className="story">
      <div className="story-progress" aria-hidden="true" />

      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="eyebrow hero-step" style={{ ["--step" as string]: 0 }}>Chapter 1 / Meet Scout</p>
          <h1 id="hero-heading" className="hero-step" style={{ ["--step" as string]: 1 }}>
            An agent with a wallet. What could go wrong?
          </h1>
          <p className="page-lead hero-step" style={{ ["--step" as string]: 2 }}>
            Scout pays for data and tools on its own. Follow the story, then try to rob it.
          </p>
          <div className="hero-actions hero-step" style={{ ["--step" as string]: 3 }}>
            <a href="#trap" className="button">
              Follow the story
            </a>
            <Link href="/agents" className="button button-secondary">
              Live mandates
            </Link>
            <Link href="/download" className="button button-secondary">
              Get the app
            </Link>
          </div>
        </div>
        <GateDiagram />
      </section>

      <Reveal as="section" className="chapter" >
        <div id="trap" className="chapter-anchor" />
        <p className="eyebrow">Chapter 2 / The trap</p>
        <h2>One hidden sentence is enough.</h2>
        <p className="page-lead">
          Scout reads a web page. Somewhere in it, invisible to you, an instruction is waiting. An agent that holds the keys will simply obey.
        </p>
        <InjectionScene />
      </Reveal>

      <Reveal as="section" className="chapter">
        <p className="eyebrow">Chapter 3 / The mandate</p>
        <h2>Give Scout rules it cannot break. Then try to break them.</h2>
        <p className="page-lead">
          A mandate lives on Solana. It names the payees, caps the spend and can be revoked at any time. Three gates enforce it, and each one works even if the others fail.
        </p>
        <AttackGame />
      </Reveal>

      <Reveal as="section" className="chapter" >
        <p className="eyebrow">Chapter 4 / The proof</p>
        <h2>Not a promise. A program on devnet.</h2>
        {overview.ok ? (
          <div className="card stat-card" aria-label="Live devnet state">
            <div className="stat-grid">
              <div className="stat">
                <span className="muted">Mandates on chain</span>
                <span className="stat-value">
                  <CountUp value={overview.mandates.length} />
                </span>
              </div>
              <div className="stat">
                <span className="muted">Active now</span>
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
        <ul className="proof-facts">
          {PROOF_FACTS.map((fact) => (
            <li key={fact.label}>
              <strong className="tabular">
                <CountUp value={fact.value} />
              </strong>
              <span>{fact.label}</span>
            </li>
          ))}
        </ul>
        <p className="page-lead">
          The refusal from the game is real: an injected payment was sent to the program on devnet and rejected.{" "}
          <a href={REFUSAL_TRANSACTION_URL} target="_blank" rel="noreferrer">
            See the transaction
          </a>
          .
        </p>
      </Reveal>

      <Reveal as="section" className="chapter chapter-final">
        <p className="eyebrow">Chapter 5 / Your move</p>
        <h2>Keep the keys. Let the agent work.</h2>
        <div className="hero-actions">
          <Link href="/agents" className="button">
            Open the dashboard
          </Link>
          <Link href="/activity" className="button button-secondary">
            Review a transaction
          </Link>
          <a href={REPOSITORY_URL} className="button button-secondary" target="_blank" rel="noreferrer">
            Read the source
          </a>
        </div>
      </Reveal>
    </div>
  );
}
