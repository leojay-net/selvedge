import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { MANDATE_PROGRAM_ADDRESS } from "@selvedge/sdk";
import { NavLinks } from "@/components/NavLinks";
import { WalletButton } from "@/components/WalletButton";
import { WalletProvider } from "@/components/WalletProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Selvedge", template: "%s | Selvedge" },
  description: "Agents that act only within an on-chain, formally verified mandate, with a security review before you sign.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1e3a5f" };

export default function RootLayout({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <WalletProvider>
          <header className="site-header">
            <div className="site-header-inner">
              <Link href="/" className="brand-link" aria-label="Selvedge home">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.svg" alt="Selvedge" width={160} height={36} />
              </Link>
              <NavLinks />
              <WalletButton />
            </div>
          </header>
          <main id="main" className="page" tabIndex={-1}>
            {children}
          </main>
        </WalletProvider>
        <footer className="site-footer">
          <div className="site-footer-inner">
            <span>
              Mandate program <code>{MANDATE_PROGRAM_ADDRESS}</code> on Solana devnet
            </span>
            <span className="muted">MIT licensed. Open source.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
