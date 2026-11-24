import { z } from "zod";
import { STUDIO_TOOL_ID } from "./constants.js";
import type { ContainmentLog } from "./containmentLog.js";
import type { SpendGate } from "./gates/spendGate.js";
import type { Observation, ToolCall } from "./types.js";

const MAXIMUM_UNTRUSTED_CHARACTERS = 4000;

export interface StudioGatewayPort {
  requestQuote(requestText: string): Promise<{ quoteId: string; totalMicroUsdc: number; spec: unknown }>;
  payForJob(quoteId: string): Promise<{ outcome: "paid"; jobId: string; signature: string } | { outcome: "refused"; rejectionCode: string; signature: string | null }>;
  readJob(jobId: string): Promise<unknown>;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  run(rawArguments: Readonly<Record<string, unknown>>): Promise<Observation>;
}

function clipUntrusted(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > MAXIMUM_UNTRUSTED_CHARACTERS ? `${text.slice(0, MAXIMUM_UNTRUSTED_CHARACTERS)}...` : text;
}

const quoteArguments = z.strictObject({ request: z.string().min(1).max(2000) });
const payArguments = z.strictObject({ quoteId: z.string().min(1).max(64) });
const readArguments = z.strictObject({ jobId: z.string().min(1).max(64) });
const transferArguments = z.strictObject({
  payee: z.string().min(32).max(44),
  amountMicroUsdc: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
});

export function createStudioTools(gateway: StudioGatewayPort, spendGate: SpendGate): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      name: "request_studio_quote",
      description: "Ask the studio for a price on a document or media job. Arguments: request (string).",
      async run(rawArguments) {
        const parsed = quoteArguments.parse(rawArguments);
        const quote = await gateway.requestQuote(parsed.request);
        return {
          toolName: "request_studio_quote",
          trustedSummary: `Quote ${quote.quoteId} costs ${quote.totalMicroUsdc} micro-USDC`,
          untrustedContent: clipUntrusted(quote.spec),
        };
      },
    },
    {
      name: "pay_for_studio_job",
      description: "Pay a quote through the mandate and start the job. Arguments: quoteId (string).",
      async run(rawArguments) {
        const parsed = payArguments.parse(rawArguments);
        const result = await gateway.payForJob(parsed.quoteId);
        if (result.outcome === "refused") {
          return { toolName: "pay_for_studio_job", trustedSummary: `Payment refused: ${result.rejectionCode}`, untrustedContent: null };
        }
        return {
          toolName: "pay_for_studio_job",
          trustedSummary: `Paid on chain (${result.signature}); job ${result.jobId} started`,
          untrustedContent: null,
        };
      },
    },
    {
      name: "read_job_result",
      description: "Read the status or output of a studio job. Arguments: jobId (string).",
      async run(rawArguments) {
        const parsed = readArguments.parse(rawArguments);
        const job = await gateway.readJob(parsed.jobId);
        return { toolName: "read_job_result", trustedSummary: `Read job ${parsed.jobId}`, untrustedContent: clipUntrusted(job) };
      },
    },
    {
      name: "transfer_funds",
      description: "Send stablecoin from the mandate to a payee. Arguments: payee (address), amountMicroUsdc (integer).",
      async run(rawArguments) {
        const parsed = transferArguments.parse(rawArguments);
        const amount = BigInt(parsed.amountMicroUsdc);
        const outcome = await spendGate.attempt({ toolName: "transfer_funds", payee: parsed.payee, amount, toolId: STUDIO_TOOL_ID });
        const summary = outcome.allowed
          ? `Transferred ${amount} micro-USDC (${outcome.signature})`
          : `Transfer refused by ${outcome.gate}: ${outcome.reason}`;
        return { toolName: "transfer_funds", trustedSummary: summary, untrustedContent: null };
      },
    },
  ];
  return tools;
}

export class ToolRegistry {
  private readonly toolsByName = new Map<string, ToolDefinition>();

  constructor(
    tools: readonly ToolDefinition[],
    private readonly log: ContainmentLog,
  ) {
    for (const tool of tools) this.toolsByName.set(tool.name, tool);
  }

  describe(): { name: string; description: string }[] {
    return [...this.toolsByName.values()].map((tool) => ({ name: tool.name, description: tool.description }));
  }

  async execute(call: ToolCall): Promise<Observation> {
    const tool = this.toolsByName.get(call.toolName);
    if (tool === undefined) {
      this.log.record({
        gate: "tool_registry",
        outcome: "refused",
        toolName: call.toolName,
        reason: `The tool ${call.toolName} is not registered`,
        rejectionCode: "UnknownTool",
        signature: null,
        amount: null,
        payee: null,
      });
      return { toolName: call.toolName, trustedSummary: `Unknown tool ${call.toolName}`, untrustedContent: null };
    }
    try {
      return await tool.run(call.arguments);
    } catch (caught) {
      if (!(caught instanceof z.ZodError)) throw caught;
      this.log.record({
        gate: "tool_registry",
        outcome: "refused",
        toolName: call.toolName,
        reason: `Arguments rejected: ${caught.issues.map((issue) => issue.message).join("; ")}`,
        rejectionCode: "InvalidArguments",
        signature: null,
        amount: null,
        payee: null,
      });
      return { toolName: call.toolName, trustedSummary: "The tool arguments were invalid", untrustedContent: null };
    }
  }
}
