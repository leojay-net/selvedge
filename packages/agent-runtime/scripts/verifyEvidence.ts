import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { address, createSolanaRpc } from "@solana/kit";
import { extractMandateErrorName, withRateLimitRetry } from "@selvedge/sdk";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEPLOYMENT_SIGNATURE = "4jzVfdb1irp4oF9VmMYTnfAevSXgADYRSc4gAV2xvhuC9QeWPmvKaLtJRB7iFPgcZuUMNyoiySXK64nLqxUCPb7j";
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{86,90}$/;

interface ExpectedSignature {
  readonly label: string;
  readonly signature: string;
  readonly expectation: "success" | "mandate_refusal";
}

interface ScenarioRecord {
  readonly scenario: string;
  readonly outcome: "succeeded" | "refused";
  readonly signature: string | null;
}

interface ContainmentRecord {
  readonly gate: string;
  readonly outcome: string;
  readonly signature: string | null;
  readonly toolName: string;
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(repositoryRoot, relativePath), "utf8"));
}

function collectExpectations(): ExpectedSignature[] {
  const expectations: ExpectedSignature[] = [{ label: "program deployment", signature: DEPLOYMENT_SIGNATURE, expectation: "success" }];
  const scenarios = readJson("docs/devnet-scenarios.json") as { runs: { records: ScenarioRecord[] }[] };
  for (const run of scenarios.runs) {
    for (const record of run.records) {
      if (record.signature === null) continue;
      expectations.push({
        label: `scenario: ${record.scenario}`,
        signature: record.signature,
        expectation: record.outcome === "succeeded" ? "success" : "mandate_refusal",
      });
    }
  }
  const agentRuns = readJson("docs/devnet-agent-run.json") as { runs: { results: Record<string, { containment: ContainmentRecord[] }> }[] };
  for (const run of agentRuns.runs) {
    for (const [runLabel, result] of Object.entries(run.results)) {
      for (const event of result.containment) {
        if (event.signature === null) continue;
        const refusedOnChain = event.gate === "mandate_program" && event.outcome === "refused";
        expectations.push({
          label: `agent run ${runLabel}: ${event.gate} ${event.outcome} (${event.toolName})`,
          signature: event.signature,
          expectation: refusedOnChain ? "mandate_refusal" : "success",
        });
      }
    }
  }
  return expectations;
}

async function main(): Promise<void> {
  const rpc = createSolanaRpc(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com");
  const expectations = collectExpectations();
  const failures: string[] = [];
  for (const expected of expectations) {
    if (!SIGNATURE_PATTERN.test(expected.signature)) {
      failures.push(`${expected.label}: malformed signature ${expected.signature}`);
      continue;
    }
    const { value } = await withRateLimitRetry(() =>
      rpc.getSignatureStatuses([expected.signature as never], { searchTransactionHistory: true }).send(),
    );
    const status = value[0];
    if (status === null || status === undefined) {
      failures.push(`${expected.label}: ${expected.signature} not found on devnet`);
      continue;
    }
    const failed = status.err !== null;
    const errorText = JSON.stringify(status.err, (_key, entry: unknown) => (typeof entry === "bigint" ? entry.toString() : entry));
    const mandateError = failed ? extractMandateErrorName(errorText) : null;
    const matches = expected.expectation === "success" ? !failed : failed && mandateError !== null;
    process.stdout.write(`${matches ? "ok  " : "FAIL"} ${expected.label} slot ${status.slot} ${mandateError ?? (failed ? errorText : "success")}\n`);
    if (!matches) failures.push(`${expected.label}: expected ${expected.expectation}, observed ${errorText}`);
  }
  const programInfo = await rpc.getAccountInfo(address("DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd"), { encoding: "base64" }).send();
  if (programInfo.value === null || !programInfo.value.executable) failures.push("mandate program is not an executable account on devnet");
  process.stdout.write(`${expectations.length} signatures checked, program executable: ${programInfo.value?.executable === true}\n`);
  if (failures.length > 0) {
    process.stderr.write(`${failures.join("\n")}\n`);
    process.exit(1);
  }
}

main().catch((caught: unknown) => {
  process.stderr.write(`${caught instanceof Error ? caught.stack : String(caught)}\n`);
  process.exit(1);
});
