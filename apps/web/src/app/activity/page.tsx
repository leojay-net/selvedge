import type { Metadata } from "next";
import type { ReactElement } from "react";
import { VerdictBadge } from "@/components/Badges";
import { ReviewForm } from "@/components/ReviewForm";
import { EmptyState, ErrorState } from "@/components/States";
import { fetchRecentMandateActivity, type ActivityItem } from "@/lib/activity";
import { DEFAULT_EXPLORER_CLUSTER } from "@/lib/constants";
import { shortAddress } from "@/lib/format";

export const metadata: Metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

function activityTime(blockTime: number | null): string {
  if (blockTime === null) return "time unknown";
  return new Date(blockTime * 1000).toISOString().replace("T", " ").replace(/:\d{2}\.\d{3}Z$/, " UTC");
}

function ActivityRow({ item }: { readonly item: ActivityItem }): ReactElement {
  const cluster = process.env.NEXT_PUBLIC_EXPLORER_CLUSTER ?? DEFAULT_EXPLORER_CLUSTER;
  return (
    <li className="activity-item">
      <div className="card-title-row">
        <a href={`https://explorer.solana.com/tx/${item.signature}?cluster=${cluster}`} target="_blank" rel="noreferrer" className="mono">
          {shortAddress(item.signature)}
        </a>
        <div className="cluster">
          {item.failed ? <span className="badge badge-danger">Failed on chain</span> : null}
          {item.verdict !== null ? <VerdictBadge verdict={item.verdict} /> : <span className="badge badge-neutral">Not reviewed</span>}
        </div>
      </div>
      <p className="muted">{activityTime(item.blockTime)}</p>
      {item.instructionKinds.length > 0 ? (
        <ul>
          {item.instructionKinds.map((kind, kindIndex) => (
            <li key={`${kind}-${kindIndex}`} className="mono">
              {kind}
            </li>
          ))}
        </ul>
      ) : null}
      {item.findingTitles.length > 0 ? <p>Flagged: {item.findingTitles.join(", ")}</p> : null}
    </li>
  );
}

async function RecentActivity(): Promise<ReactElement> {
  let items: ActivityItem[];
  try {
    items = await fetchRecentMandateActivity();
  } catch {
    return <ErrorState title="Recent transactions could not be loaded">The devnet RPC did not answer. Reload the page to try again.</ErrorState>;
  }
  if (items.length === 0) {
    return (
      <EmptyState title="No transactions yet" icon="activity">
        The mandate program has not been called on this cluster. Transactions appear here as agents spend.
      </EmptyState>
    );
  }
  return (
    <ul className="activity-list">
      {items.map((item) => (
        <ActivityRow key={item.signature} item={item} />
      ))}
    </ul>
  );
}

export default function ActivityPage(): ReactElement {
  return (
    <div className="stack">
      <header className="page-header">
        <h1>Activity</h1>
        <p className="page-lead">Paste any transaction to see what it does before you sign it, or browse recent mandate transactions, each reviewed by the same engine.</p>
      </header>
      <section className="stack" aria-labelledby="review-heading" style={{ gap: "var(--space-3)" }}>
        <h2 id="review-heading">Review a transaction</h2>
        <ReviewForm />
      </section>
      <section className="stack" aria-labelledby="recent-heading" style={{ gap: "var(--space-3)" }}>
        <h2 id="recent-heading">Recent mandate transactions</h2>
        <RecentActivity />
      </section>
    </div>
  );
}
