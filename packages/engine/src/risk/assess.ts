import {
  CAUTION_SCORE_MINIMUM,
  DANGER_SCORE_MINIMUM,
  RISK_RULESET_VERSION,
  RISK_SCORE_CAP,
  RISK_SCORE_WEIGHTS,
} from "../constants.js";
import type { RiskAssessment, RiskFinding, RiskVerdict } from "../types.js";
import { RISK_RULES, type RuleInput } from "./rules.js";

export function scoreFindings(findings: readonly RiskFinding[]): number {
  let total = 0;
  for (const finding of findings) {
    total += RISK_SCORE_WEIGHTS[finding.severity];
  }
  return Math.min(total, RISK_SCORE_CAP);
}

export function verdictFor(findings: readonly RiskFinding[], score: number): RiskVerdict {
  const hasCritical = findings.some((finding) => finding.severity === "critical");
  if (hasCritical || score >= DANGER_SCORE_MINIMUM) return "danger";
  const hasWarning = findings.some((finding) => finding.severity === "warning");
  if (hasWarning || score >= CAUTION_SCORE_MINIMUM) return "caution";
  return "safe";
}

export function assessRisk(input: RuleInput): RiskAssessment {
  const findings: RiskFinding[] = [];
  for (const rule of RISK_RULES) {
    findings.push(...rule.evaluate(input));
  }
  const score = scoreFindings(findings);
  return { rulesetVersion: RISK_RULESET_VERSION, findings, score, verdict: verdictFor(findings, score) };
}
