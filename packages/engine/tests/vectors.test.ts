import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeTransactionBase64, type LookupTableContents } from "../src/decode/decodeTransaction.js";
import { assessRisk } from "../src/risk/assess.js";
import { explainReview } from "../src/risk/explain.js";
import type { AssetDelta, DecodedTransaction, ReviewContext, RiskAssessment } from "../src/types.js";

interface DecodeVector {
  name: string;
  transactionBase64: string;
  lookupTables: LookupTableContents;
  expected: DecodedTransaction;
}

interface RiskVector {
  name: string;
  transactionBase64: string;
  lookupTables: LookupTableContents;
  deltas: AssetDelta[];
  simulation: { succeeded: boolean; errorDescription: string | null } | null;
  context: ReviewContext;
  expected: RiskAssessment & { ruleIds: string[]; explanation: string };
}

function loadVectors<Vector>(relativePath: string): Vector[] {
  const filePath = fileURLToPath(new URL(relativePath, import.meta.url));
  return (JSON.parse(readFileSync(filePath, "utf8")) as { cases: Vector[] }).cases;
}

describe("decode vectors", () => {
  for (const vector of loadVectors<DecodeVector>("../../../vectors/decode/decode.v1.json")) {
    it(vector.name, () => {
      expect(decodeTransactionBase64(vector.transactionBase64, vector.lookupTables)).toEqual(vector.expected);
    });
  }
});

describe("risk vectors", () => {
  for (const vector of loadVectors<RiskVector>("../../../vectors/risk/risk.v1.json")) {
    it(vector.name, () => {
      const decoded = decodeTransactionBase64(vector.transactionBase64, vector.lookupTables);
      const assessment = assessRisk({ decoded, deltas: vector.deltas, simulation: vector.simulation, context: vector.context });
      expect(assessment.rulesetVersion).toBe(vector.expected.rulesetVersion);
      expect(assessment.findings).toEqual(vector.expected.findings);
      expect(assessment.score).toBe(vector.expected.score);
      expect(assessment.verdict).toBe(vector.expected.verdict);
      expect(explainReview(assessment, vector.deltas, vector.context)).toBe(vector.expected.explanation);
    });
  }
});
