import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { RunCheckpoint } from "./orchestrator.js";
import type { Observation } from "./types.js";

const observationsSchema = z.array(
  z.strictObject({ toolName: z.string(), trustedSummary: z.string(), untrustedContent: z.string().nullable() }),
);

export class FileCheckpoint implements RunCheckpoint {
  constructor(private readonly checkpointPath: string) {}

  load(): readonly Observation[] {
    if (!existsSync(this.checkpointPath)) return [];
    return observationsSchema.parse(JSON.parse(readFileSync(this.checkpointPath, "utf8")));
  }

  save(observations: readonly Observation[]): void {
    writeFileSync(this.checkpointPath, JSON.stringify(observations));
  }
}
