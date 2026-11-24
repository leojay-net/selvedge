import Link from "next/link";
import type { ReactElement } from "react";
import { EmptyState } from "@/components/States";

export default function MandateNotFound(): ReactElement {
  return (
    <EmptyState title="Mandate not found" icon="mandate" action={<Link href="/agents">Back to agents</Link>}>
      No mandate account exists at this address on devnet.
    </EmptyState>
  );
}
