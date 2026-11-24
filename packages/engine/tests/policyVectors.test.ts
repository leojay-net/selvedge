import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PolicyRejection } from "../src/errors.js";
import {
  authorizeAgentRotation,
  authorizeLimitUpdate,
  authorizeRevoke,
  authorizeSpend,
  rollPeriod,
  type LimitUpdate,
  type MandateState,
  type SpendRequest,
} from "../src/policy/mandatePolicy.js";

interface StateJson {
  owner: string;
  agent: string;
  securityAuthority: string;
  periodCap: string;
  periodSeconds: string;
  periodStart: string;
  spentInPeriod: string;
  expiry: string;
  revoked: boolean;
  nonce: string;
  allowedPrograms: string[];
  allowedPayees: string[];
  allowedTools: string[];
}

interface UpdateJson {
  periodCap: string;
  periodSeconds: string;
  expiry: string;
  allowedPrograms: string[];
  allowedPayees: string[];
  allowedTools: string[];
}

interface VectorInput {
  signer: string;
  amount: string;
  toolId: string;
  program: string;
  payee: string;
  expectedNonce: string;
  newAgent: string;
  update: UpdateJson;
}

interface VectorCase {
  name: string;
  operation: "spend" | "revoke" | "update_limits" | "rotate_agent" | "roll_period";
  state: StateJson;
  input: Partial<VectorInput>;
  now: string;
  expected: { ok?: StateJson; rejection?: string };
}

const vectorPath = fileURLToPath(new URL("../../../vectors/policy/policy.v1.json", import.meta.url));
const vectorFile = JSON.parse(readFileSync(vectorPath, "utf8")) as { cases: VectorCase[] };

function stateFromJson(json: StateJson): MandateState {
  return {
    owner: json.owner,
    agent: json.agent,
    securityAuthority: json.securityAuthority,
    periodCap: BigInt(json.periodCap),
    periodSeconds: BigInt(json.periodSeconds),
    periodStart: BigInt(json.periodStart),
    spentInPeriod: BigInt(json.spentInPeriod),
    expiry: BigInt(json.expiry),
    revoked: json.revoked,
    nonce: BigInt(json.nonce),
    allowedPrograms: json.allowedPrograms,
    allowedPayees: json.allowedPayees,
    allowedTools: json.allowedTools.map(BigInt),
  };
}

function stateToJson(state: MandateState): StateJson {
  return {
    owner: state.owner,
    agent: state.agent,
    securityAuthority: state.securityAuthority,
    periodCap: state.periodCap.toString(),
    periodSeconds: state.periodSeconds.toString(),
    periodStart: state.periodStart.toString(),
    spentInPeriod: state.spentInPeriod.toString(),
    expiry: state.expiry.toString(),
    revoked: state.revoked,
    nonce: state.nonce.toString(),
    allowedPrograms: [...state.allowedPrograms],
    allowedPayees: [...state.allowedPayees],
    allowedTools: state.allowedTools.map((tool) => tool.toString()),
  };
}

function updateFromJson(json: UpdateJson): LimitUpdate {
  return {
    periodCap: BigInt(json.periodCap),
    periodSeconds: BigInt(json.periodSeconds),
    expiry: BigInt(json.expiry),
    allowedPrograms: json.allowedPrograms,
    allowedPayees: json.allowedPayees,
    allowedTools: json.allowedTools.map(BigInt),
  };
}

function execute(vector: VectorCase): MandateState {
  const state = stateFromJson(vector.state);
  const now = BigInt(vector.now);
  const input = vector.input as VectorInput;
  switch (vector.operation) {
    case "spend": {
      const request: SpendRequest = {
        signer: input.signer,
        amount: BigInt(input.amount),
        toolId: BigInt(input.toolId),
        program: input.program,
        payee: input.payee,
        expectedNonce: BigInt(input.expectedNonce),
      };
      return authorizeSpend(state, request, now);
    }
    case "revoke":
      return authorizeRevoke(state, input.signer);
    case "update_limits":
      return authorizeLimitUpdate(state, input.signer, updateFromJson(input.update), now);
    case "rotate_agent":
      return authorizeAgentRotation(state, input.signer, input.newAgent);
    case "roll_period":
      return rollPeriod(state, now);
  }
}

describe("mandate policy vectors generated from the on-chain Rust logic", () => {
  it("contains a meaningful number of cases", () => {
    expect(vectorFile.cases.length).toBeGreaterThan(250);
  });

  for (const vector of vectorFile.cases) {
    it(vector.name, () => {
      if (vector.expected.ok !== undefined) {
        expect(stateToJson(execute(vector))).toEqual(vector.expected.ok);
        return;
      }
      let thrown: unknown = null;
      try {
        execute(vector);
      } catch (caught) {
        thrown = caught;
      }
      expect(thrown).toBeInstanceOf(PolicyRejection);
      expect((thrown as PolicyRejection).rejection).toBe(vector.expected.rejection);
    });
  }
});
