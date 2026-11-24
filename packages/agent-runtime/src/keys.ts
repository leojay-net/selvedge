import { readFileSync } from "node:fs";
import { createKeyPairSignerFromBytes, type KeyPairSigner } from "@solana/kit";
import { KeyFileError } from "./errors.js";

const SECRET_KEY_BYTE_LENGTH = 64;

export async function loadKeyPairSigner(keyFilePath: string): Promise<KeyPairSigner> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(keyFilePath, "utf8"));
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : String(caught);
    throw new KeyFileError(`Cannot read key file: ${reason}`, keyFilePath);
  }
  const isByteArray =
    Array.isArray(parsed) &&
    parsed.length === SECRET_KEY_BYTE_LENGTH &&
    parsed.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255);
  if (!isByteArray) {
    throw new KeyFileError(`Key file must be a JSON array of ${SECRET_KEY_BYTE_LENGTH} bytes`, keyFilePath);
  }
  return createKeyPairSignerFromBytes(Uint8Array.from(parsed as number[]));
}
