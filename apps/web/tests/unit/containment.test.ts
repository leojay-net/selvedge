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
