import { PolicyRejection } from "../errors.js";

export const MAX_ALLOWED_PROGRAMS = 4;
export const MAX_ALLOWED_PAYEES = 4;
export const MAX_ALLOWED_TOOLS = 8;
export const MIN_PERIOD_SECONDS = 60n;
export const MAX_PERIOD_SECONDS = 31_536_000n;
export const MAX_U64 = 18_446_744_073_709_551_615n;
const MAX_I64 = 9_223_372_036_854_775_807n;
const MIN_I64 = -9_223_372_036_854_775_808n;
const NULL_KEY = "0".repeat(64);

export interface MandateState {
  readonly owner: string;
  readonly agent: string;
  readonly securityAuthority: string;
  readonly periodCap: bigint;
  readonly periodSeconds: bigint;
  readonly periodStart: bigint;
  readonly spentInPeriod: bigint;
  readonly expiry: bigint;
  readonly revoked: boolean;
  readonly nonce: bigint;
  readonly allowedPrograms: readonly string[];
  readonly allowedPayees: readonly string[];
  readonly allowedTools: readonly bigint[];
}

export interface SpendRequest {
  readonly signer: string;
  readonly amount: bigint;
  readonly toolId: bigint;
  readonly program: string;
  readonly payee: string;
  readonly expectedNonce: bigint;
}

export interface LimitUpdate {
  readonly periodCap: bigint;
  readonly periodSeconds: bigint;
  readonly expiry: bigint;
  readonly allowedPrograms: readonly string[];
  readonly allowedPayees: readonly string[];
  readonly allowedTools: readonly bigint[];
}

function reject(rejection: string): never {
  throw new PolicyRejection(rejection);
}

function checkedI64(value: bigint): bigint {
  if (value > MAX_I64 || value < MIN_I64) reject("ArithmeticOverflow");
  return value;
}

function isValidAllowlist(length: number, capacity: number): boolean {
  return length >= 1 && length <= capacity;
}

export function validateLimits(update: LimitUpdate, now: bigint): void {
  if (update.periodCap === 0n) reject("InvalidCap");
  if (update.periodSeconds < MIN_PERIOD_SECONDS || update.periodSeconds > MAX_PERIOD_SECONDS) reject("InvalidPeriod");
  if (update.expiry <= now) reject("InvalidExpiry");
  const listsValid =
    isValidAllowlist(update.allowedPrograms.length, MAX_ALLOWED_PROGRAMS) &&
    isValidAllowlist(update.allowedPayees.length, MAX_ALLOWED_PAYEES) &&
    isValidAllowlist(update.allowedTools.length, MAX_ALLOWED_TOOLS);
  if (!listsValid) reject("InvalidAllowlist");
}

export function rollPeriod(state: MandateState, now: bigint): MandateState {
  const periodEnd = checkedI64(state.periodStart + state.periodSeconds);
  if (now < periodEnd) return state;
  const elapsed = checkedI64(now - state.periodStart);
  if (state.periodSeconds <= 0n) reject("InvalidPeriod");
  const wholePeriods = elapsed / state.periodSeconds;
  const advance = checkedI64(wholePeriods * state.periodSeconds);
  return { ...state, periodStart: checkedI64(state.periodStart + advance), spentInPeriod: 0n };
}

export function authorizeSpend(state: MandateState, request: SpendRequest, now: bigint): MandateState {
  if (state.revoked) reject("Revoked");
  if (request.signer !== state.agent) reject("UnauthorizedSigner");
  if (now >= state.expiry) reject("Expired");
  if (request.expectedNonce !== state.nonce) reject("StaleNonce");
  if (request.amount === 0n) reject("ZeroAmount");
  if (!state.allowedPrograms.includes(request.program)) reject("ProgramNotAllowed");
  if (!state.allowedPayees.includes(request.payee)) reject("PayeeNotAllowed");
  if (!state.allowedTools.includes(request.toolId)) reject("ToolNotAllowed");
  const rolled = rollPeriod(state, now);
  const spentAfter = rolled.spentInPeriod + request.amount;
  if (spentAfter > MAX_U64) reject("ArithmeticOverflow");
  if (spentAfter > rolled.periodCap) reject("CapExceeded");
  const nextNonce = rolled.nonce + 1n;
  if (nextNonce > MAX_U64) reject("ArithmeticOverflow");
  return { ...rolled, spentInPeriod: spentAfter, nonce: nextNonce };
}

export function authorizeRevoke(state: MandateState, signer: string): MandateState {
  if (signer !== state.owner && signer !== state.securityAuthority) reject("UnauthorizedSigner");
  if (state.revoked) reject("AlreadyRevoked");
  return { ...state, revoked: true };
}

export function authorizeLimitUpdate(
  state: MandateState,
  signer: string,
  update: LimitUpdate,
  now: bigint,
): MandateState {
  if (signer !== state.owner) reject("UnauthorizedSigner");
  if (state.revoked) reject("Revoked");
  validateLimits(update, now);
  const rolled = rollPeriod(state, now);
  if (update.periodCap < rolled.spentInPeriod) reject("CapBelowSpent");
  return {
    ...rolled,
    periodCap: update.periodCap,
    periodSeconds: update.periodSeconds,
    expiry: update.expiry,
    allowedPrograms: update.allowedPrograms,
    allowedPayees: update.allowedPayees,
    allowedTools: update.allowedTools,
  };
}

export function authorizeAgentRotation(state: MandateState, signer: string, newAgent: string): MandateState {
  if (signer !== state.owner) reject("UnauthorizedSigner");
  if (state.revoked) reject("Revoked");
  if (newAgent === state.owner || newAgent === NULL_KEY) reject("InvalidAgent");
  const nextNonce = state.nonce + 1n;
  if (nextNonce > MAX_U64) reject("ArithmeticOverflow");
  return { ...state, agent: newAgent, nonce: nextNonce };
}
