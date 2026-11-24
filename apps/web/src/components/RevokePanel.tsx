"use client";

import { useState, type ReactElement } from "react";
import {
  appendTransactionMessageInstruction,
  compileTransaction,
  createTransactionMessage,
  getBase58Decoder,
  getBase64Decoder,
  getTransactionEncoder,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Blockhash,
} from "@solana/kit";
import { revokeMandateInstruction } from "@selvedge/sdk";
import type { ReviewResult } from "@selvedge/engine";
import { DEFAULT_EXPLORER_CLUSTER } from "@/lib/constants";
import { Icon } from "./Icons";
import { ReviewView } from "./ReviewView";
import { ErrorState } from "./States";
import { useWallet } from "./WalletProvider";

const base64Decoder = getBase64Decoder();
const base58Decoder = getBase58Decoder();
const transactionEncoder = getTransactionEncoder();

type RevokePhase =
  | { readonly name: "idle" }
  | { readonly name: "preparing" }
  | { readonly name: "reviewing"; readonly review: ReviewResult; readonly transactionBytes: Uint8Array }
  | { readonly name: "signing"; readonly review: ReviewResult }
  | { readonly name: "sent"; readonly signature: string }
  | { readonly name: "failed"; readonly message: string };

interface RevokePanelProps {
  readonly mandateAddress: string;
  readonly ownerAddress: string;
  readonly securityAuthorityAddress: string;
  readonly revoked: boolean;
}

interface BlockhashResponse {
  readonly blockhash: string;
  readonly lastValidBlockHeight: number;
}

async function buildRevokeTransaction(signerAddress: string, mandateAddress: string): Promise<Uint8Array> {
  const response = await fetch("/api/blockhash");
  if (!response.ok) throw new Error("A recent blockhash could not be fetched.");
  const latest = (await response.json()) as BlockhashResponse;
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (draft) => setTransactionMessageFeePayer(signerAddress as Address, draft),
    (draft) =>
      setTransactionMessageLifetimeUsingBlockhash(
        { blockhash: latest.blockhash as Blockhash, lastValidBlockHeight: BigInt(latest.lastValidBlockHeight) },
        draft,
      ),
    (draft) => appendTransactionMessageInstruction(revokeMandateInstruction(signerAddress, mandateAddress), draft),
  );
  return new Uint8Array(transactionEncoder.encode(compileTransaction(message)));
}

async function requestReview(transactionBytes: Uint8Array, signerAddress: string): Promise<ReviewResult> {
  const response = await fetch("/api/review", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transactionBase64: base64Decoder.decode(transactionBytes),
      walletAddresses: [signerAddress],
      simulate: false,
    }),
  });
  if (!response.ok) throw new Error("The revoke transaction could not be reviewed.");
  return (await response.json()) as ReviewResult;
}

export function RevokePanel({ mandateAddress, ownerAddress, securityAuthorityAddress, revoked }: RevokePanelProps): ReactElement {
  const wallet = useWallet();
  const [phase, setPhase] = useState<RevokePhase>({ name: "idle" });
  const account = wallet.accountAddress;
  const mayRevoke = account !== null && (account === ownerAddress || account === securityAuthorityAddress);

  if (revoked) {
    return (
      <div className="notice notice-danger" role="status">
        <Icon name="revoke" />
        <p>This mandate is revoked. The agent can no longer spend. Revocation is final.</p>
      </div>
    );
  }

  async function prepare(): Promise<void> {
    if (account === null) return;
    setPhase({ name: "preparing" });
    try {
      const transactionBytes = await buildRevokeTransaction(account, mandateAddress);
      const review = await requestReview(transactionBytes, account);
      setPhase({ name: "reviewing", review, transactionBytes });
    } catch (caught) {
      setPhase({ name: "failed", message: caught instanceof Error ? caught.message : "Preparing the revoke transaction failed." });
    }
  }

  async function confirm(review: ReviewResult, transactionBytes: Uint8Array): Promise<void> {
    setPhase({ name: "signing", review });
    try {
      const signature = await wallet.signAndSend(transactionBytes);
      setPhase({ name: "sent", signature: base58Decoder.decode(signature) });
    } catch (caught) {
      setPhase({ name: "failed", message: caught instanceof Error ? caught.message : "The wallet did not sign the transaction." });
    }
  }

  const explorerCluster = process.env.NEXT_PUBLIC_EXPLORER_CLUSTER ?? DEFAULT_EXPLORER_CLUSTER;

  return (
    <section className="card" aria-labelledby="kill-switch-heading">
      <h2 id="kill-switch-heading">Kill switch</h2>
      <p className="muted">Revoking stops every future spend by this agent at the program level. It cannot be undone.</p>
      {account === null ? (
        <p>Connect the owner or security wallet to revoke. Without a wallet the dashboard is read-only.</p>
      ) : !mayRevoke ? (
        <p>The connected wallet is neither the owner nor the security authority of this mandate, so it cannot revoke it.</p>
      ) : null}

      {phase.name === "idle" || phase.name === "preparing" || phase.name === "failed" ? (
        <div className="cluster">
          <button
            type="button"
            className="button button-danger"
            disabled={!mayRevoke || phase.name === "preparing"}
            data-loading={phase.name === "preparing"}
            onClick={() => void prepare()}
          >
            <Icon name={phase.name === "preparing" ? "refresh" : "revoke"} small />
            {phase.name === "preparing" ? "Preparing review" : "Review revoke transaction"}
          </button>
        </div>
      ) : null}

      <div aria-live="polite" className="stack">
        {phase.name === "failed" ? <ErrorState title="Revoke did not go through">{phase.message}</ErrorState> : null}
        {phase.name === "reviewing" || phase.name === "signing" ? (
          <>
            <ReviewView review={phase.review} />
            {phase.name === "reviewing" ? (
              <div className="cluster">
                <button type="button" className="button button-danger" onClick={() => void confirm(phase.review, phase.transactionBytes)}>
                  <Icon name="revoke" small />
                  Revoke and sign in wallet
                </button>
                <button type="button" className="button button-secondary" onClick={() => setPhase({ name: "idle" })}>
                  Cancel
                </button>
              </div>
            ) : (
              <p role="status">Waiting for the wallet to sign.</p>
            )}
          </>
        ) : null}
        {phase.name === "sent" ? (
          <div className="notice notice-safe" role="status">
            <Icon name="check" />
            <p>
              Revoke submitted. Signature{" "}
              <a href={`https://explorer.solana.com/tx/${phase.signature}?cluster=${explorerCluster}`} rel="noreferrer" target="_blank" className="mono">
                {phase.signature.slice(0, 12)}...
              </a>
              . Refresh the page once it confirms.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
