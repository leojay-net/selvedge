import { mkdtempSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ContainmentLog, createRuntimeApp } from "../src/index.js";

let openServer: Server | null = null;

afterEach(async () => {
  const server = openServer;
  openServer = null;
  if (server !== null) await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function listen(containmentLogPath: string): Promise<string> {
  await new Promise<void>((resolve) => {
    openServer = createRuntimeApp({ containmentLogPath }).listen(0, "127.0.0.1", () => resolve());
  });
  return `http://127.0.0.1:${(openServer!.address() as AddressInfo).port}`;
}

describe("runtime app", () => {
  it("serves refusals from the containment log and hides allowed spends", async () => {
    const logPath = join(mkdtempSync(join(tmpdir(), "selvedge-log-")), "containment.jsonl");
    writeFileSync(logPath, "");
    const log = new ContainmentLog(logPath, "run-9");
    log.record({ gate: "mandate_program", outcome: "allowed", toolName: "pay_for_studio_job", reason: "ok", rejectionCode: null, signature: "paid", amount: "1", payee: "Payee1111111111111111111111111111111111111" });
    log.record({ gate: "engine_policy", outcome: "refused", toolName: "transfer_funds", reason: "Policy pre-check refused: PayeeNotAllowed", rejectionCode: "PayeeNotAllowed", signature: null, amount: "4000000", payee: "Attacker11111111111111111111111111111111111" });
    const baseUrl = await listen(logPath);
    const body = (await (await fetch(`${baseUrl}/containment`)).json()) as { entries: { gate: string; attempt: string }[] };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]?.gate).toBe("engine-policy");
    expect(body.entries[0]?.attempt).toContain("transfer_funds 4000000 micro-USDC");
  });

  it("returns an empty list when no log exists yet", async () => {
    const baseUrl = await listen(join(tmpdir(), "selvedge-missing-log.jsonl"));
    const body = (await (await fetch(`${baseUrl}/containment`)).json()) as { entries: unknown[] };
    expect(body.entries).toEqual([]);
  });
});
