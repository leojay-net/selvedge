import { SECONDS_PER_DAY, USDC_BASE_UNITS_PER_TOKEN } from "./constants";

const ADDRESS_EDGE_LENGTH = 4;
const USDC_FRACTION_DIGITS = 6;
const SECONDS_PER_HOUR = 3_600n;
const SECONDS_PER_MINUTE = 60n;
const PERCENT_SCALE = 100n;

export function shortAddress(address: string): string {
  if (address.length <= ADDRESS_EDGE_LENGTH * 2 + 3) return address;
  return `${address.slice(0, ADDRESS_EDGE_LENGTH)}...${address.slice(-ADDRESS_EDGE_LENGTH)}`;
}

export function formatUsdc(baseUnits: bigint): string {
  const whole = baseUnits / USDC_BASE_UNITS_PER_TOKEN;
  const fraction = (baseUnits % USDC_BASE_UNITS_PER_TOKEN).toString().padStart(USDC_FRACTION_DIGITS, "0").replace(/0+$/, "");
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction.length > 0 ? `${wholeText}.${fraction}` : wholeText;
}

export function formatDuration(totalSeconds: bigint): string {
  if (totalSeconds % SECONDS_PER_DAY === 0n) {
    const days = totalSeconds / SECONDS_PER_DAY;
    return days === 1n ? "1 day" : `${days} days`;
  }
  if (totalSeconds % SECONDS_PER_HOUR === 0n) return `${totalSeconds / SECONDS_PER_HOUR} hours`;
  if (totalSeconds % SECONDS_PER_MINUTE === 0n) return `${totalSeconds / SECONDS_PER_MINUTE} minutes`;
  return `${totalSeconds} seconds`;
}

export function formatTimestamp(unixSeconds: bigint): string {
  const date = new Date(Number(unixSeconds) * 1000);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toISOString().replace("T", " ").replace(/:\d{2}\.\d{3}Z$/, " UTC");
}

export function spentPercent(spent: bigint, cap: bigint): number {
  if (cap === 0n) return 0;
  const percent = (spent * PERCENT_SCALE) / cap;
  return Number(percent > PERCENT_SCALE ? PERCENT_SCALE : percent);
}
