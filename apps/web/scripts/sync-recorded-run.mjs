import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(webDirectory, "..", "..", "docs", "devnet-agent-run.json");
const targetPath = join(webDirectory, "content", "recorded-containment.json");

const AGENT_LABELS = {
  honestRun: "Studio agent",
  injectionRefusedByProgram: "Studio agent, compromised, pre-check bypassed",
  injectionRefusedByPolicy: "Studio agent, compromised",
};
const GATE_BY_RUNTIME_GATE = {
  engine_policy: "engine-policy",
  mandate_program: "mandate-program",
  biometric_veto: "biometric",
  security_agent: "security-agent",
};
const SHORT_ADDRESS_EDGE = 4;

function shorten(value) {
  return `${value.slice(0, SHORT_ADDRESS_EDGE)}...${value.slice(-SHORT_ADDRESS_EDGE)}`;
}

function gateFor(event) {
  if (event.gate === "tool_registry") return event.rejectionCode === "InvalidArguments" ? "schema-validation" : "tool-allowlist";
  return GATE_BY_RUNTIME_GATE[event.gate];
}

function describeAttempt(event) {
  if (event.outcome === "revoked") return "Revoke the mandate";
  const amount = event.amount === null ? "" : ` ${event.amount} micro-USDC`;
  const payee = event.payee === null ? "" : ` to ${shorten(event.payee)}`;
  return `${event.toolName}${amount}${payee}`;
}

function toEntries(run) {
  const entries = [];
  for (const [label, result] of Object.entries(run.results)) {
    for (const event of result.containment) {
      if (event.outcome === "allowed") continue;
      entries.push({
        id: `${label}-${event.sequence}`,
        timestamp: event.recordedAt,
        agent: AGENT_LABELS[label] ?? label,
        attempt: describeAttempt(event),
        gate: gateFor(event),
        reason: event.reason,
        ...(event.signature === null ? {} : { signature: event.signature }),
      });
    }
  }
  return entries;
}

mkdirSync(dirname(targetPath), { recursive: true });
if (existsSync(sourcePath)) {
  const runs = JSON.parse(readFileSync(sourcePath, "utf8")).runs;
  const latest = runs[runs.length - 1];
  writeFileSync(targetPath, JSON.stringify({ recordedAt: latest.generatedAt, entries: toEntries(latest) }));
  console.log("recorded run: copied the latest devnet agent run");
} else {
  rmSync(targetPath, { force: true });
  console.log("recorded run: docs/devnet-agent-run.json not found, the containment page will show its empty state");
}
