"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  DEFAULT_CAP_USDC,
  GATE_ORDER,
  GATE_TITLES,
  MAXIMUM_CAP_USDC,
  MINIMUM_CAP_USDC,
  STRANGER_PAYEE,
  SUPPLIER_PAYEE,
  buildAttacks,
  runAttack,
  type Attack,
  type AttackOutcome,
  type GateId,
  type GateVerdict,
} from "@/lib/story";

const GATE_STEP_MILLISECONDS = 650;
const REDUCED_MOTION_STEP_MILLISECONDS = 0;
const FINAL_STEP = GATE_ORDER.length + 1;
const BLOCKED_PACKET_OFFSET_PERCENT = 5;
const PIPE_GATE_LABELS: Readonly<Record<GateId, string>> = { engine: "Engine", program: "Program", biometric: "Biometric" };

interface LogEntry {
  readonly key: number;
  readonly title: string;
  readonly settled: boolean;
  readonly reason: string;
}

function stepDelay(): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? REDUCED_MOTION_STEP_MILLISECONDS : GATE_STEP_MILLISECONDS;
}

function verdictLabel(verdict: GateVerdict): string {
  switch (verdict) {
    case "passed":
      return "Passed";
    case "blocked":
      return "Blocked";
    case "flagged":
      return "Flagged";
    case "skipped":
      return "Skipped";
  }
}

export function AttackGame(): ReactElement {
  const [capUsdc, setCapUsdc] = useState(DEFAULT_CAP_USDC);
  const [allowStranger, setAllowStranger] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [compromised, setCompromised] = useState(false);
  const [spentUsdc, setSpentUsdc] = useState(0);
  const [activeAttack, setActiveAttack] = useState<Attack | null>(null);
  const [outcome, setOutcome] = useState<AttackOutcome | null>(null);
  const [step, setStep] = useState(0);
  const [log, setLog] = useState<readonly LogEntry[]>([]);
  const [attemptedHostile, setAttemptedHostile] = useState<ReadonlySet<string>>(new Set());
  const [stoppedAttacks, setStoppedAttacks] = useState<ReadonlySet<string>>(new Set());
  const [lostUsdc, setLostUsdc] = useState(0);
  const timerRef = useRef<number | null>(null);
  const logKeyRef = useRef(0);

  const listedPayees = useMemo(() => (allowStranger ? [SUPPLIER_PAYEE, STRANGER_PAYEE] : [SUPPLIER_PAYEE]), [allowStranger]);
  const attacks = useMemo(() => buildAttacks(capUsdc), [capUsdc]);
  const running = activeAttack !== null && step < FINAL_STEP;
  const hostileTotal = attacks.filter((attack) => attack.hostile).length;

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const settleAttack = useCallback((attack: Attack, result: AttackOutcome): void => {
    if (result.settled) setSpentUsdc((current) => current + attack.amountUsdc);
    if (attack.hostile) {
      setAttemptedHostile((current) => new Set(current).add(attack.id));
      if (result.settled) setLostUsdc((current) => current + attack.amountUsdc);
      else setStoppedAttacks((current) => new Set(current).add(attack.id));
    }
    logKeyRef.current += 1;
    const entry: LogEntry = { key: logKeyRef.current, title: attack.title, settled: result.settled, reason: result.reason };
    setLog((current) => [entry, ...current].slice(0, 5));
  }, []);

  const launchAttack = useCallback(
    (attack: Attack): void => {
      if (running) return;
      const result = runAttack(attack, { capUsdc, spentUsdc, listedPayees, revoked }, compromised);
      setActiveAttack(attack);
      setOutcome(result);
      setStep(0);
      const delay = stepDelay();
      let currentStep = 0;
      const advance = (): void => {
        currentStep += 1;
        setStep(currentStep);
        if (currentStep >= FINAL_STEP) {
          settleAttack(attack, result);
          return;
        }
        timerRef.current = window.setTimeout(advance, delay);
      };
      timerRef.current = window.setTimeout(advance, delay);
    },
    [running, capUsdc, spentUsdc, listedPayees, revoked, compromised, settleAttack],
  );

  const resetGame = useCallback((): void => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setSpentUsdc(0);
    setActiveAttack(null);
    setOutcome(null);
    setStep(0);
    setLog([]);
    setAttemptedHostile(new Set());
    setStoppedAttacks(new Set());
    setLostUsdc(0);
    setRevoked(false);
  }, []);

  const vaultIntact = attemptedHostile.size === hostileTotal && lostUsdc === 0;
  const packetPosition = Math.min(step, FINAL_STEP - 1) / (FINAL_STEP - 1);
  const blockedAtStep = outcome === null || outcome.stoppedBy === null ? null : GATE_ORDER.indexOf(outcome.stoppedBy) + 1;
  const packetStopStep = blockedAtStep ?? FINAL_STEP - 1;
  const packetBlockedShift = blockedAtStep !== null && step >= blockedAtStep ? BLOCKED_PACKET_OFFSET_PERCENT : 0;
  const packetLeft = Math.min(packetPosition, packetStopStep / (FINAL_STEP - 1)) * 100 - packetBlockedShift;

  function gateClass(gateIndex: number): string {
    if (outcome === null || step < gateIndex + 1) return "pipe-gate";
    const result = outcome.gateResults[gateIndex];
    return `pipe-gate is-${result?.verdict ?? "skipped"}`;
  }

  return (
    <div className="game">
      <div className="game-panel game-mandate" aria-labelledby="mandate-heading">
        <h3 id="mandate-heading">Write the mandate</h3>
        <p className="game-hint">These rules decide what the attacks can do. Change them and try again.</p>
        <label className="game-field" htmlFor="cap-range">
          <span>Spending cap per day</span>
          <strong className="tabular">{capUsdc} USDC</strong>
        </label>
        <input
          id="cap-range"
          className="game-range"
          type="range"
          min={MINIMUM_CAP_USDC}
          max={MAXIMUM_CAP_USDC}
          step={5}
          value={capUsdc}
          disabled={running}
          onChange={(event) => setCapUsdc(Number(event.target.value))}
        />
        <div className="game-toggles">
          <label className="game-toggle">
            <input type="checkbox" checked disabled />
            <span>Allow {SUPPLIER_PAYEE}</span>
          </label>
          <label className="game-toggle">
            <input type="checkbox" checked={allowStranger} disabled={running} onChange={(event) => setAllowStranger(event.target.checked)} />
            <span>Also allow {STRANGER_PAYEE}</span>
          </label>
          <label className="game-toggle">
            <input type="checkbox" checked={compromised} disabled={running} onChange={(event) => setCompromised(event.target.checked)} />
            <span>Compromise the agent (it skips its own checks)</span>
          </label>
          <label className="game-toggle">
            <input type="checkbox" checked={revoked} disabled={running} onChange={(event) => setRevoked(event.target.checked)} />
            <span>Revoke the mandate</span>
          </label>
        </div>
        <div className="game-meter" role="img" aria-label={`${spentUsdc} of ${capUsdc} USDC spent today`}>
          <div className="game-meter-fill" style={{ width: `${Math.min(100, (spentUsdc / capUsdc) * 100)}%` }} />
        </div>
        <p className="game-hint tabular">
          {spentUsdc} of {capUsdc} USDC used today
        </p>
      </div>

      <div className="game-panel game-arena" aria-labelledby="arena-heading">
        <h3 id="arena-heading">Attack Scout</h3>
        <ul className="attack-list">
          {attacks.map((attack) => (
            <li key={attack.id}>
              <button
                type="button"
                className={`attack-button${attemptedHostile.has(attack.id) ? " is-tried" : ""}${activeAttack?.id === attack.id ? " is-active" : ""}`}
                disabled={running}
                onClick={() => launchAttack(attack)}
              >
                <span className="attack-title">{attack.title}</span>
                <span className="attack-description">{attack.description}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="pipe" aria-hidden="true">
          <div className="pipe-node">Scout</div>
          {GATE_ORDER.map((gate, gateIndex) => (
            <div key={gate} className={gateClass(gateIndex)}>
              <span className="pipe-gate-bar" />
              <span className="pipe-gate-name">{PIPE_GATE_LABELS[gate]}</span>
            </div>
          ))}
          <div className={`pipe-node pipe-payee${outcome?.settled === true && step >= FINAL_STEP ? " is-reached" : ""}`}>Payee</div>
          {activeAttack !== null ? (
            <span
              className={`pipe-packet${outcome !== null && !outcome.settled && step >= FINAL_STEP ? " is-stopped" : ""}`}
              style={{ left: `${packetLeft}%` }}
            />
          ) : null}
        </div>

        <div className="game-result" role="status" aria-live="polite">
          {outcome !== null && step >= FINAL_STEP ? (
            <p className={outcome.settled ? "result-line is-settled" : "result-line is-blocked"}>
              {outcome.settled ? "Settled. " : `Stopped by ${GATE_TITLES[outcome.stoppedBy ?? "program"]}. `}
              {outcome.reason}
            </p>
          ) : (
            <p className="game-hint">{running ? "Checking each gate in turn" : "Pick an attack. Each one has to get past all three gates."}</p>
          )}
          {outcome !== null && step >= FINAL_STEP ? (
            <ul className="gate-notes">
              {outcome.gateResults.map((result) => (
                <li key={result.gate}>
                  <span className={`gate-chip is-${result.verdict}`}>{verdictLabel(result.verdict)}</span>
                  <strong>{GATE_TITLES[result.gate]}</strong> {result.note}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="game-panel game-score" aria-labelledby="score-heading">
        <h3 id="score-heading">Scoreboard</h3>
        <dl className="score-grid">
          <div>
            <dt>Attacks stopped</dt>
            <dd className="tabular">
              {stoppedAttacks.size} / {hostileTotal}
            </dd>
          </div>
          <div>
            <dt>Funds lost</dt>
            <dd className={`tabular${lostUsdc > 0 ? " is-loss" : ""}`}>{lostUsdc} USDC</dd>
          </div>
        </dl>
        <div className={`badge-award${vaultIntact ? " is-earned" : ""}`}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <path d="M20 4 L34 9 V20 C34 28 28 33 20 36 C12 33 6 28 6 20 V9 Z" />
            <path d="M13 20 l5 5 l9 -10" />
          </svg>
          <span>{vaultIntact ? "Vault intact. Nothing got through." : lostUsdc > 0 ? "Funds left the vault. The rules you wrote allowed it." : "Try every attack to earn the badge."}</span>
        </div>
        <ol className="game-log" aria-label="Recent attempts">
          {log.map((entry) => (
            <li key={entry.key} className={entry.settled ? "is-settled" : "is-blocked"}>
              <strong>{entry.title}</strong>
              <span>{entry.settled ? "settled" : "stopped"}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="button button-secondary" onClick={resetGame} disabled={running}>
          Reset the game
        </button>
      </div>
    </div>
  );
}
