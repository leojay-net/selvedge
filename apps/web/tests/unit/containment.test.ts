import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchContainmentLog } from "@/lib/containment";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchContainmentLog", () => {
  it("is unconfigured without a runtime url", async () => {
    vi.stubEnv("SELVEDGE_RUNTIME_URL", "");
    expect(await fetchContainmentLog()).toEqual({ state: "unconfigured" });
  });

  it("falls back to the recorded devnet run when a content file exists", async () => {
    vi.stubEnv("SELVEDGE_RUNTIME_URL", "");
    const workingDirectory = mkdtempSync(join(tmpdir(), "selvedge-recorded-"));
    mkdirSync(join(workingDirectory, "content"));
    const entry = { id: "r-1", timestamp: "2026-11-24T00:00:00Z", agent: "Studio agent", attempt: "transfer", gate: "security-agent", reason: "revoked", signature: "sig" };
    writeFileSync(join(workingDirectory, "content", "recorded-containment.json"), JSON.stringify({ recordedAt: "2026-11-24T00:00:00Z", entries: [entry] }));
    vi.spyOn(process, "cwd").mockReturnValue(workingDirectory);
    const result = await fetchContainmentLog();
    expect(result.state).toBe("recorded");
    vi.restoreAllMocks();
  });

  it("reports unreachable when the request fails", async () => {
    vi.stubEnv("SELVEDGE_RUNTIME_URL", "http://runtime.invalid");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connect failed")));
    expect((await fetchContainmentLog()).state).toBe("unreachable");
  });

  it("reports unreachable when the payload has the wrong shape", async () => {
    vi.stubEnv("SELVEDGE_RUNTIME_URL", "http://runtime.invalid");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ entries: [{ id: 1 }] }), { status: 200 })));
    expect((await fetchContainmentLog()).state).toBe("unreachable");
  });

  it("returns validated entries", async () => {
    vi.stubEnv("SELVEDGE_RUNTIME_URL", "http://runtime.invalid/");
    const payload = {
      entries: [{ id: "a", timestamp: "now", agent: "agent", attempt: "spend", gate: "biometric", reason: "needs a person" }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 })));
    const result = await fetchContainmentLog();
    expect(result.state === "ready" && result.entries.length).toBe(1);
  });
});
