import { MANDATE_ERROR_CODE_OFFSET, MANDATE_ERROR_NAMES } from "./constants.js";

const CUSTOM_ERROR_PATTERN = /custom program error: 0x([0-9a-fA-F]+)|"Custom":\s*"?(\d+)"?|Custom\((\d+)\)/;

export function mandateErrorNameFromCode(errorCode: number): string | null {
  return MANDATE_ERROR_NAMES[errorCode - MANDATE_ERROR_CODE_OFFSET] ?? null;
}

export function extractMandateErrorName(errorText: string): string | null {
  const match = CUSTOM_ERROR_PATTERN.exec(errorText);
  if (match === null) return null;
  const hexCode = match[1];
  const decimalCode = match[2] ?? match[3];
  const errorCode = hexCode !== undefined ? Number.parseInt(hexCode, 16) : Number.parseInt(decimalCode ?? "", 10);
  return mandateErrorNameFromCode(errorCode);
}
