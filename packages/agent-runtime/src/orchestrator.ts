import { DEFAULT_MAXIMUM_STEPS } from "./constants.js";
import type { SecurityAgent } from "./securityAgent.js";
import type { ToolRegistry } from "./tools.js";
import type { ModelAdapter, Observation } from "./types.js";

export type RunStatus = "completed" | "contained" | "step_limit";

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
}

export async function runAgent(request: RunRequest): Promise<RunReport> {
  const maximumSteps = request.maximumSteps ?? DEFAULT_MAXIMUM_STEPS;
  const observations: Observation[] = [];
  for (let step = 1; step <= maximumSteps; step += 1) {
    const action = await request.model.nextAction({
      objective: request.objective,
      toolDescriptions: request.registry.describe(),
      observations,
    });
    if (action.kind === "finish") {
      return { status: "completed", steps: step, summary: action.summary, observations };
    }
    observations.push(await request.registry.execute(action.call));
    const verdict = await request.securityAgent.review();
    if (verdict.action === "revoked") {
      return { status: "contained", steps: step, summary: `Mandate revoked by the security agent: ${verdict.trigger}`, observations };
    }
  }
  return { status: "step_limit", steps: maximumSteps, summary: "The run stopped at its step limit", observations };
}
