import { z } from "zod";
import { RUNTIME_TIMEOUT_MILLISECONDS } from "./constants";
import { runtimeBaseUrl } from "./env";

export const containmentEntrySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().min(1),
  agent: z.string().min(1),
  attempt: z.string().min(1),
  gate: z.enum(["engine-policy", "mandate-program", "biometric", "tool-allowlist", "schema-validation"]),
  reason: z.string().min(1),
});

const containmentResponseSchema = z.object({ entries: z.array(containmentEntrySchema) });

export type ContainmentEntry = z.infer<typeof containmentEntrySchema>;

export type ContainmentResult =
  | { readonly state: "unconfigured" }
  | { readonly state: "unreachable"; readonly reason: string }
  | { readonly state: "ready"; readonly entries: readonly ContainmentEntry[] };

export const GATE_LABELS: Readonly<Record<ContainmentEntry["gate"], string>> = {
  "engine-policy": "Engine policy",
  "mandate-program": "Mandate program",
  biometric: "Biometric confirmation",
  "tool-allowlist": "Tool allowlist",
  "schema-validation": "Schema validation",
};

export async function fetchContainmentLog(): Promise<ContainmentResult> {
  const baseUrl = runtimeBaseUrl();
  if (baseUrl === null) return { state: "unconfigured" };
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), RUNTIME_TIMEOUT_MILLISECONDS);
  try {
    const response = await fetch(`${baseUrl}/containment`, { signal: abortController.signal, cache: "no-store" });
    if (!response.ok) return { state: "unreachable", reason: `The runtime answered HTTP ${response.status}.` };
    const parsed = containmentResponseSchema.safeParse(await response.json());
    if (!parsed.success) return { state: "unreachable", reason: "The runtime answered with data in an unexpected shape." };
    return { state: "ready", entries: parsed.data.entries };
  } catch (caught) {
    const reason = caught instanceof Error && caught.name === "AbortError" ? "The runtime did not answer in time." : "The runtime could not be reached.";
    return { state: "unreachable", reason };
  } finally {
    clearTimeout(timer);
  }
}
