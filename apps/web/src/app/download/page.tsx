import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactElement } from "react";
import { ErrorState } from "@/components/States";
import { MOBILE_ONLY_MESSAGE, isAndroidPhone } from "@/lib/download";

export const metadata: Metadata = { title: "Get the app" };
export const dynamic = "force-dynamic";

export default async function DownloadPage(): Promise<ReactElement> {
  const requestHeaders = await headers();
  const onAndroidPhone = isAndroidPhone(requestHeaders.get("user-agent"));
  return (
    <div className="stack">
      <header className="page-header">
        <h1>Get the app</h1>
        <p className="page-lead">Selvedge for Android decodes and explains every transaction before you sign, and a dangerous one cannot be signed without a biometric check.</p>
      </header>
      {onAndroidPhone ? (
        <section className="stack" aria-label="Download">
          <a className="button" href="/api/download">
            Download for Android
          </a>
          <p className="page-lead">Android asks you to allow installs from your browser the first time. This build runs on devnet with a software test wallet.</p>
        </section>
      ) : (
        <ErrorState title="Open this page on your Android phone">{MOBILE_ONLY_MESSAGE}</ErrorState>
      )}
    </div>
  );
}
