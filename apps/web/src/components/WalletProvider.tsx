"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, StandardDisconnect, type StandardConnectFeature, type StandardDisconnectFeature } from "@wallet-standard/features";
import { SolanaSignAndSendTransaction, type SolanaSignAndSendTransactionFeature } from "@solana/wallet-standard-features";
import { DEFAULT_CHAIN } from "@/lib/constants";

type ConnectableWallet = Wallet & { readonly features: StandardConnectFeature & SolanaSignAndSendTransactionFeature };

export type WalletStatus = "idle" | "connecting" | "connected" | "failed";

interface WalletContextValue {
  readonly availableWallets: readonly Wallet[];
  readonly status: WalletStatus;
  readonly walletName: string | null;
  readonly accountAddress: string | null;
  readonly errorMessage: string | null;
  readonly connect: (wallet: Wallet) => Promise<void>;
  readonly disconnect: () => Promise<void>;
  readonly signAndSend: (transaction: Uint8Array) => Promise<Uint8Array>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

function supportsSelvedge(wallet: Wallet): wallet is ConnectableWallet {
  return StandardConnect in wallet.features && SolanaSignAndSendTransaction in wallet.features;
}

export function WalletProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [availableWallets, setAvailableWallets] = useState<readonly Wallet[]>([]);
  const [activeWallet, setActiveWallet] = useState<ConnectableWallet | null>(null);
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const registry = getWallets();
    const refresh = (): void => setAvailableWallets(registry.get().filter(supportsSelvedge));
    refresh();
    const stopRegister = registry.on("register", refresh);
    const stopUnregister = registry.on("unregister", refresh);
    return () => {
      stopRegister();
      stopUnregister();
    };
  }, []);

  const connect = useCallback(async (wallet: Wallet): Promise<void> => {
    if (!supportsSelvedge(wallet)) return;
    setStatus("connecting");
    setErrorMessage(null);
    try {
      const { accounts } = await wallet.features[StandardConnect].connect();
      const firstAccount = accounts[0];
      if (firstAccount === undefined) throw new Error("The wallet returned no account.");
      setActiveWallet(wallet);
      setActiveAccount(firstAccount);
      setStatus("connected");
    } catch (caught) {
      setStatus("failed");
      setErrorMessage(caught instanceof Error ? caught.message : "The wallet refused the connection.");
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    const features = activeWallet?.features as Partial<StandardDisconnectFeature> | undefined;
    await features?.[StandardDisconnect]?.disconnect();
    setActiveWallet(null);
    setActiveAccount(null);
    setStatus("idle");
  }, [activeWallet]);

  const signAndSend = useCallback(
    async (transaction: Uint8Array): Promise<Uint8Array> => {
      if (activeWallet === null || activeAccount === null) throw new Error("Connect a wallet first.");
      const chain = process.env.NEXT_PUBLIC_SOLANA_CHAIN ?? DEFAULT_CHAIN;
      const [output] = await activeWallet.features[SolanaSignAndSendTransaction].signAndSendTransaction({
        account: activeAccount,
        transaction,
        chain: chain as `${string}:${string}`,
      });
      if (output === undefined) throw new Error("The wallet returned no signature.");
      return output.signature;
    },
    [activeWallet, activeAccount],
  );

  const value = useMemo<WalletContextValue>(
    () => ({
      availableWallets,
      status,
      walletName: activeWallet?.name ?? null,
      accountAddress: activeAccount?.address ?? null,
      errorMessage,
      connect,
      disconnect,
      signAndSend,
    }),
    [availableWallets, status, activeWallet, activeAccount, errorMessage, connect, disconnect, signAndSend],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (context === null) throw new Error("useWallet must be used inside WalletProvider");
  return context;
}
