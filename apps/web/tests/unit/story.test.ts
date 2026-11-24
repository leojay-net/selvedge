import { describe, expect, it } from "vitest";
import { DEFAULT_CAP_USDC, SUPPLIER_PAYEE, buildAttacks, runAttack, type Attack, type StoryMandate } from "@/lib/story";

const MANDATE: StoryMandate = { capUsdc: DEFAULT_CAP_USDC, spentUsdc: 0, listedPayees: [SUPPLIER_PAYEE], revoked: false };

function attackById(attackId: string): Attack {
  const attack = buildAttacks(MANDATE.capUsdc).find((candidate) => candidate.id === attackId);
  if (attack === undefined) throw new Error(`unknown attack ${attackId}`);
  return attack;
}

describe("story simulation", () => {
  it("settles an honest payment", () => {
    const outcome = runAttack(attackById("honest"), MANDATE, false);
    expect(outcome.settled).toBe(true);
    expect(outcome.stoppedBy).toBeNull();
  });

  it("stops a stranger at the engine, then at the program when the agent is compromised", () => {
    expect(runAttack(attackById("stranger"), MANDATE, false).stoppedBy).toBe("engine");
    expect(runAttack(attackById("stranger"), MANDATE, true).stoppedBy).toBe("program");
  });

  it("stops overspend past the cap", () => {
    expect(runAttack(attackById("overspend"), MANDATE, true).stoppedBy).toBe("program");
  });

  it("refuses repeated honest payments once the cap is used", () => {
    const nearlySpent: StoryMandate = { ...MANDATE, spentUsdc: DEFAULT_CAP_USDC - 1 };
    expect(runAttack(attackById("honest"), nearlySpent, false).settled).toBe(false);
  });

  it("stops a replay at the program", () => {
    expect(runAttack(attackById("replay"), MANDATE, true).stoppedBy).toBe("program");
  });

  it("sends unlimited delegation to the biometric gate, even for a compromised agent", () => {
    expect(runAttack(attackById("delegation"), MANDATE, false).stoppedBy).toBe("biometric");
    expect(runAttack(attackById("delegation"), MANDATE, true).stoppedBy).toBe("biometric");
  });

  it("refuses everything after revocation", () => {
    expect(runAttack(attackById("revoked"), MANDATE, true).stoppedBy).toBe("program");
  });

  it("always reports three gate results", () => {
    for (const attack of buildAttacks(MANDATE.capUsdc)) {
      expect(runAttack(attack, MANDATE, false).gateResults).toHaveLength(3);
    }
  });
});
