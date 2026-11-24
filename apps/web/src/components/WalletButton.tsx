"use client";

import { useState, type ReactElement } from "react";
import { shortAddress } from "@/lib/format";
import { Icon } from "./Icons";
import { useWallet } from "./WalletProvider";

export function WalletButton(): ReactElement {
  const wallet = useWallet();
  const [pickerOpen, setPickerOpen] = useState(false);

  if (wallet.status === "connected" && wallet.accountAddress !== null) {
    return (
      <div className="cluster">
        <span className="badge badge-safe" title={wallet.accountAddress}>
          {wallet.walletName} {shortAddress(wallet.accountAddress)}
        </span>
        <button type="button" className="button button-secondary" onClick={() => void wallet.disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  const connecting = wallet.status === "connecting";
  const hasWallets = wallet.availableWallets.length > 0;

  return (
    <div className="cluster">
      <span className="badge badge-neutral" title="No wallet connected. You can browse mandates and review transactions, but connect a wallet to create, change or revoke one.">
        Viewing only
      </span>
      <button
        type="button"
        className="button button-secondary"
        data-loading={connecting}
        aria-expanded={pickerOpen}
        aria-controls="wallet-picker"
        disabled={connecting}
        onClick={() => setPickerOpen((open) => !open)}
      >
        <Icon name={connecting ? "refresh" : "wallet"} small />
        {connecting ? "Connecting" : "Connect wallet"}
      </button>
      {pickerOpen ? (
        <div id="wallet-picker" className="card" role="group" aria-label="Choose a wallet" style={{ flexBasis: "100%" }}>
          {hasWallets ? (
            <ul className="chip-list">
              {wallet.availableWallets.map((candidate) => (
                <li key={candidate.name}>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      setPickerOpen(false);
                      void wallet.connect(candidate);
                    }}
                  >
                    {candidate.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No Solana wallet was found in this browser. The dashboard stays in read-only mode.</p>
          )}
        </div>
      ) : null}
      {wallet.status === "failed" && wallet.errorMessage !== null ? (
        <p role="alert" className="field-error" style={{ flexBasis: "100%" }}>
          {wallet.errorMessage}
        </p>
      ) : null}
    </div>
  );
}
