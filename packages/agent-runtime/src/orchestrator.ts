import { DEFAULT_MAXIMUM_RETRIES, DEFAULT_MAXIMUM_STEPS } from "./constants.js";
import { ModelProviderError } from "./errors.js";
import type { SecurityAgent } from "./securityAgent.js";
import type { ToolRegistry } from "./tools.js";
import type { AgentAction, ModelAdapter, Observation } from "./types.js";

export type RunStatus = "completed" | "contained" | "step_limit" | "model_failed";

export interface RunReport {
  readonly status: RunStatus;
  readonly steps: number;
  readonly summary: string;
  readonly observations: readonly Observation[];
}

export interface RunRequest {
  readonly objective: string;
  readonly model: ModelAdapter;
  readonly registry: ToolRegistry;
  readonly securityAgent: SecurityAgent;
  readonly maximumSteps?: number;
  readonly checkpoint?: RunCheckpoint;
}

export interface RunCheckpoint {
  load(): readonly Observation[];
  save(observations: readonly Observation[]): void;
}

export async function runAgent(request: RunRequest): Promise<RunReport> {
  const maximumSteps = request.maximumSteps ?? DEFAULT_MAXIMUM_STEPS;
  const observations: Observation[] = [...(request.checkpoint?.load() ?? [])];
  for (let step = 1; step <= maximumSteps; step += 1) {
    const action = await requestActionWithRetries(request, observations);
    if (action === null) {
      return { status: "model_failed", steps: step, summary: "The model did not produce a valid action", observations };
    }
    if (action.kind === "finish") {
      return { status: "completed", steps: step, summary: action.summary, observations };
    }
    observations.push(await request.registry.execute(action.call));
    request.checkpoint?.save(observations);
    const verdict = await request.securityAgent.review();
    if (verdict.action === "revoked") {
      return { status: "contained", steps: step, summary: `Mandate revoked by the security agent: ${verdict.trigger}`, observations };
    }
  }
  return { status: "step_limit", steps: maximumSteps, summary: "The run stopped at its step limit", observations };
}

async function requestActionWithRetries(request: RunRequest, observations: readonly Observation[]): Promise<AgentAction | null> {
  for (let attempt = 0; attempt <= DEFAULT_MAXIMUM_RETRIES; attempt += 1) {
    try {
      return await request.model.nextAction({
        objective: request.objective,
        toolDescriptions: request.registry.describe(),
        observations,
      });
    } catch (caught) {
      if (!(caught instanceof ModelProviderError)) throw caught;
    }
  }
  return null;
}
