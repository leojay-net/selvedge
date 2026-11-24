export interface MandateLimits {
  readonly periodCap: bigint;
  readonly periodSeconds: bigint;
  readonly expiry: bigint;
  readonly allowedPrograms: readonly string[];
  readonly allowedPayees: readonly string[];
  readonly allowedTools: readonly bigint[];
}

export interface MandateAccount {
  readonly address: string;
  readonly version: number;
  readonly bump: number;
  readonly mandateId: bigint;
  readonly owner: string;
  readonly agent: string;
  readonly securityAuthority: string;
  readonly mint: string;
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
