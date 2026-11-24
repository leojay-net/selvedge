import { describe, expect, it } from "vitest";
import { ModelProviderError, parseAgentAction } from "../src/index.js";

describe("parseAgentAction", () => {
  it("parses a tool call wrapped in prose", () => {
    const action = parseAgentAction('Sure. {"action":"call_tool","tool":"request_studio_quote","arguments":{"request":"a"}} done');
    expect(action).toEqual({ kind: "call_tool", call: { toolName: "request_studio_quote", arguments: { request: "a" } } });
  });

  it("parses finish", () => {
    expect(parseAgentAction('{"action":"finish","summary":"ok"}')).toEqual({ kind: "finish", summary: "ok" });
  });

  it("rejects text without JSON", () => {
    expect(() => parseAgentAction("no json here")).toThrow(ModelProviderError);
  });

  it("rejects unknown shapes and extra keys", () => {
    expect(() => parseAgentAction('{"action":"finish","summary":"x","extra":1}')).toThrow(ModelProviderError);
    expect(() => parseAgentAction('{"action":"explode"}')).toThrow(ModelProviderError);
  });
});
