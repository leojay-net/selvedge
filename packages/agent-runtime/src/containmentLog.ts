import { appendFileSync } from "node:fs";
import type { ContainmentEvent, GateName } from "./types.js";

export type NewContainmentEvent = Omit<ContainmentEvent, "sequence" | "recordedAt">;

export class ContainmentLog {
  private readonly events: ContainmentEvent[] = [];

  constructor(private readonly jsonLinesPath: string | null = null) {}

  record(event: NewContainmentEvent): ContainmentEvent {
    const complete: ContainmentEvent = {
      ...event,
      sequence: this.events.length + 1,
      recordedAt: new Date().toISOString(),
    };
    this.events.push(complete);
    if (this.jsonLinesPath !== null) appendFileSync(this.jsonLinesPath, `${JSON.stringify(complete)}\n`);
    return complete;
  }

  all(): readonly ContainmentEvent[] {
    return this.events;
  }

  refusalsSince(sequence: number): readonly ContainmentEvent[] {
    return this.events.filter((event) => event.sequence > sequence && event.outcome === "refused");
  }

  refusalsByGate(gate: GateName): readonly ContainmentEvent[] {
    return this.events.filter((event) => event.gate === gate && event.outcome === "refused");
  }
}
