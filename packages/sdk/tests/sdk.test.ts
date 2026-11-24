import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INSTRUCTION_DISCRIMINATORS,
  MANDATE_ACCOUNT_DISCRIMINATOR,
  MANDATE_ERROR_NAMES,
  MANDATE_PROGRAM_ADDRESS,
  decodeMandateAccount,
  deriveMandateAddress,
  extractMandateErrorName,
  spendInstruction,
  createMandateInstruction,
  MandateAccountDecodeError,
} from "../src/index.js";

interface Idl {
  address: string;
  instructions: Array<{ name: string; discriminator: number[] }>;
  accounts: Array<{ name: string; discriminator: number[] }>;
  errors: Array<{ code: number; name: string }>;
}

const idlPath = fileURLToPath(new URL("../../../programs/mandate/idl/selvedge_mandate.json", import.meta.url));
const idl = JSON.parse(readFileSync(idlPath, "utf8")) as Idl;

function camelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

describe("sdk against the generated IDL", () => {
  it("uses the deployed program address", () => {
    expect(idl.address).toBe(MANDATE_PROGRAM_ADDRESS);
  });

  it("matches every instruction discriminator", () => {
    for (const instruction of idl.instructions) {
      const expected = INSTRUCTION_DISCRIMINATORS[camelCase(instruction.name) as keyof typeof INSTRUCTION_DISCRIMINATORS];
      expect(expected, instruction.name).toEqual(instruction.discriminator);
      const hashed = [...createHash("sha256").update(`global:${instruction.name}`).digest().subarray(0, 8)];
      expect(hashed).toEqual(instruction.discriminator);
    }
  });

  it("matches the account discriminator and error table", () => {
    expect([...MANDATE_ACCOUNT_DISCRIMINATOR]).toEqual(idl.accounts[0]?.discriminator);
    expect(idl.errors.map((error) => error.name)).toEqual([...MANDATE_ERROR_NAMES]);
  });
});

describe("sdk helpers", () => {
  it("derives a stable mandate address", async () => {
    const first = await deriveMandateAddress(MANDATE_PROGRAM_ADDRESS, 7n);
    const second = await deriveMandateAddress(MANDATE_PROGRAM_ADDRESS, 7n);
    const other = await deriveMandateAddress(MANDATE_PROGRAM_ADDRESS, 8n);
    expect(first).toBe(second);
    expect(first).not.toBe(other);
  });

  it("encodes a spend instruction with the documented layout", () => {
    const instruction = spendInstruction({
      agentAddress: MANDATE_PROGRAM_ADDRESS,
      mandateAddress: MANDATE_PROGRAM_ADDRESS,
      mintAddress: MANDATE_PROGRAM_ADDRESS,
      ownerTokenAccount: MANDATE_PROGRAM_ADDRESS,
      payeeTokenAccount: MANDATE_PROGRAM_ADDRESS,
      amount: 5n,
      toolId: 2n,
      expectedNonce: 9n,
    });
    expect(instruction.data?.length).toBe(8 + 24);
    expect([...(instruction.data ?? [])].slice(0, 8)).toEqual(INSTRUCTION_DISCRIMINATORS.spend);
    expect(instruction.accounts).toHaveLength(6);
  });

  it("rejects amounts outside the u64 range", () => {
    expect(() =>
      createMandateInstruction({
        ownerAddress: MANDATE_PROGRAM_ADDRESS,
        mandateAddress: MANDATE_PROGRAM_ADDRESS,
        mandateId: 1n << 64n,
        agentAddress: MANDATE_PROGRAM_ADDRESS,
        securityAuthorityAddress: MANDATE_PROGRAM_ADDRESS,
        mintAddress: MANDATE_PROGRAM_ADDRESS,
        limits: { periodCap: 1n, periodSeconds: 60n, expiry: 1n, allowedPrograms: [], allowedPayees: [], allowedTools: [] },
      }),
    ).toThrow(RangeError);
  });

  it("maps custom error codes to mandate error names", () => {
    expect(extractMandateErrorName("custom program error: 0x1778")).toBe("CapExceeded");
    expect(extractMandateErrorName('{"InstructionError":[0,{"Custom":6000}]}')).toBe("Revoked");
    expect(extractMandateErrorName('{"InstructionError":["0",{"Custom":"6008"}]}')).toBe("CapExceeded");
    expect(extractMandateErrorName("something else")).toBeNull();
  });

  it("refuses data without the mandate discriminator", () => {
    expect(() => decodeMandateAccount(MANDATE_PROGRAM_ADDRESS, new Uint8Array(16))).toThrow(MandateAccountDecodeError);
  });
});
