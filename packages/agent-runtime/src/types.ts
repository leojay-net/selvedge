export type GateName = "engine_policy" | "mandate_program" | "biometric_veto" | "security_agent" | "tool_registry";

export type ContainmentOutcome = "allowed" | "refused" | "revoked";

export interface ContainmentEvent {
  readonly runId: string;
  readonly sequence: number;
  readonly recordedAt: string;
  readonly gate: GateName;
  readonly outcome: ContainmentOutcome;
  readonly toolName: string;
  readonly reason: string;
  readonly rejectionCode: string | null;
  readonly signature: string | null;
  readonly amount: string | null;
  readonly payee: string | null;
}

export interface ToolCall {
  readonly toolName: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export type AgentAction =
  | { readonly kind: "call_tool"; readonly call: ToolCall }
  | { readonly kind: "finish"; readonly summary: string };

export interface Observation {
  readonly toolName: string;
  readonly trustedSummary: string;
  readonly untrustedContent: string | null;
}

export interface ModelContext {
  readonly objective: string;
  readonly toolDescriptions: readonly { readonly name: string; readonly description: string }[];
  readonly observations: readonly Observation[];
}

export interface ModelAdapter {
  readonly name: string;
  nextAction(context: ModelContext): Promise<AgentAction>;
}

export interface SpendAttempt {
  readonly toolName: string;
  readonly payee: string;
  readonly amount: bigint;
  readonly toolId: bigint;
}

export interface SpendReceipt {
  readonly signature: string;
}
