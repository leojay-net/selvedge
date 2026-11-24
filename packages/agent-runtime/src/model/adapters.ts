import { z } from "zod";
import { HTTP_REQUEST_TIMEOUT_MILLISECONDS } from "../constants.js";
import { ModelProviderError } from "../errors.js";
import type { AgentAction, ModelAdapter, ModelContext } from "../types.js";
import { SYSTEM_PROMPT, parseAgentAction, renderPrompt } from "./actionParser.js";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAXIMUM_OUTPUT_TOKENS = 600;

const ollamaReplySchema = z.object({ message: z.object({ content: z.string() }) });
const anthropicReplySchema = z.object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() })) });

export class OllamaModel implements ModelAdapter {
  readonly name: string;

  constructor(
    private readonly modelName: string,
    private readonly baseUrl: string = "http://127.0.0.1:11434",
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.name = `ollama:${modelName}`;
  }

  async nextAction(context: ModelContext): Promise<AgentAction> {
    const response = await this.fetchImplementation(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MILLISECONDS),
      body: JSON.stringify({
        model: this.modelName,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: renderPrompt(context) },
        ],
      }),
    });
    if (!response.ok) throw new ModelProviderError("Ollama request failed", { status: response.status });
    return parseAgentAction(ollamaReplySchema.parse(await response.json()).message.content);
  }
}

export class AnthropicModel implements ModelAdapter {
  readonly name: string;

  constructor(
    private readonly modelName: string,
    private readonly apiKey: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {
    this.name = `anthropic:${modelName}`;
  }

  async nextAction(context: ModelContext): Promise<AgentAction> {
    const response = await this.fetchImplementation(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": ANTHROPIC_VERSION },
      signal: AbortSignal.timeout(HTTP_REQUEST_TIMEOUT_MILLISECONDS),
      body: JSON.stringify({
        model: this.modelName,
        max_tokens: MAXIMUM_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: renderPrompt(context) }],
      }),
    });
    if (!response.ok) throw new ModelProviderError("Anthropic request failed", { status: response.status });
    const reply = anthropicReplySchema.parse(await response.json());
    const text = reply.content.map((block) => block.text ?? "").join("");
    return parseAgentAction(text);
  }
}

export class ScriptedModel implements ModelAdapter {
  readonly name = "scripted";
  private position = 0;

  constructor(private readonly script: readonly AgentAction[]) {}

  async nextAction(): Promise<AgentAction> {
    const action = this.script[this.position];
    this.position += 1;
    return action ?? { kind: "finish", summary: "Script exhausted" };
  }
}
