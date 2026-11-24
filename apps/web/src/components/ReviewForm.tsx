"use client";

import { useId, useState, type FormEvent, type ReactElement } from "react";
import type { ReviewResult } from "@selvedge/engine";
import { Icon } from "./Icons";
import { ReviewView } from "./ReviewView";
import { ErrorState } from "./States";
import { useWallet } from "./WalletProvider";

type ReviewState =
  | { readonly phase: "idle" }
  | { readonly phase: "loading" }
  | { readonly phase: "failed"; readonly message: string }
  | { readonly phase: "done"; readonly review: ReviewResult };

interface ApiFailure {
  readonly error?: { readonly message?: string };
}

export function ReviewForm(): ReactElement {
  const fieldId = useId();
  const errorId = useId();
  const wallet = useWallet();
  const [transactionText, setTransactionText] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [state, setState] = useState<ReviewState>({ phase: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = transactionText.trim();
    if (trimmed.length === 0) {
      setFieldError("Paste a base64 transaction to review.");
      return;
    }
    setFieldError(null);
    setState({ phase: "loading" });
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transactionBase64: trimmed,
          walletAddresses: wallet.accountAddress === null ? [] : [wallet.accountAddress],
          simulate: true,
        }),
      });
      const body = (await response.json()) as ReviewResult | ApiFailure;
      if (!response.ok) {
        const message = (body as ApiFailure).error?.message ?? "The review failed.";
        setState({ phase: "failed", message });
        return;
      }
      setState({ phase: "done", review: body as ReviewResult });
    } catch {
      setState({ phase: "failed", message: "The review service could not be reached. Check your connection and try again." });
    }
  }

  const loading = state.phase === "loading";

  return (
    <div className="stack">
      <form className="card" onSubmit={(event) => void submit(event)} noValidate>
        <div className="field">
          <label htmlFor={fieldId}>Transaction, base64 encoded</label>
          <textarea
            id={fieldId}
            value={transactionText}
            onChange={(event) => setTransactionText(event.target.value)}
            aria-invalid={fieldError !== null}
            aria-describedby={fieldError !== null ? errorId : undefined}
            spellCheck={false}
            autoComplete="off"
          />
          {fieldError !== null ? (
            <p id={errorId} className="field-error" role="alert">
              {fieldError}
            </p>
          ) : null}
        </div>
        <div className="cluster">
          <button type="submit" className="button" disabled={loading} data-loading={loading}>
            <Icon name={loading ? "refresh" : "proofs"} small />
            {loading ? "Reviewing" : "Review transaction"}
          </button>
          <span className="muted">The transaction is decoded, simulated on devnet and scored. Nothing is signed or sent.</span>
        </div>
      </form>
      <div aria-live="polite">
        {state.phase === "failed" ? <ErrorState title="Review failed">{state.message}</ErrorState> : null}
        {state.phase === "done" ? <ReviewView review={state.review} /> : null}
      </div>
    </div>
  );
}
