import { describe, expect, it } from "vitest";
import { formatDuration, formatUsdc, shortAddress, spentPercent } from "@/lib/format";

describe("formatUsdc", () => {
  it("formats whole and fractional amounts without trailing zeros", () => {
    expect(formatUsdc(50_000_000n)).toBe("50");
    expect(formatUsdc(12_500_000n)).toBe("12.5");
    expect(formatUsdc(1n)).toBe("0.000001");
    expect(formatUsdc(1_234_567_000_000n)).toBe("1,234,567");
  });
});

describe("formatDuration", () => {
  it("picks the largest exact unit", () => {
    expect(formatDuration(86_400n)).toBe("1 day");
    expect(formatDuration(172_800n)).toBe("2 days");
    expect(formatDuration(7_200n)).toBe("2 hours");
    expect(formatDuration(90n)).toBe("90 seconds");
  });
});

describe("spentPercent", () => {
  it("is zero for a zero cap and clamps at one hundred", () => {
    expect(spentPercent(5n, 0n)).toBe(0);
    expect(spentPercent(25n, 100n)).toBe(25);
    expect(spentPercent(500n, 100n)).toBe(100);
  });
});

describe("shortAddress", () => {
  it("keeps short strings and abbreviates long ones", () => {
    expect(shortAddress("abc")).toBe("abc");
    expect(shortAddress("DDorK5hW2iufBzDi3mmpuiFW2mZT57jGFE2jewmp7pxd")).toBe("DDor...7pxd");
  });
});
