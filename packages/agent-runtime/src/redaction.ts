const REDACTION_MARKER = "[redacted]";
const SECRET_KEY_BYTE_ARRAY_MINIMUM_LENGTH = 32;

const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(api[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/gi,
  new RegExp(`\\[\\s*\\d{1,3}(\\s*,\\s*\\d{1,3}){${SECRET_KEY_BYTE_ARRAY_MINIMUM_LENGTH - 1},}\\s*\\]`, "g"),
];

export function redactSensitiveText(text: string): string {
  return SENSITIVE_PATTERNS.reduce((current, pattern) => current.replace(pattern, REDACTION_MARKER), text);
}
