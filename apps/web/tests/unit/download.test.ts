import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/download/route";
import { ANDROID_APK_URL, isAndroidPhone } from "@/lib/download";

const PIXEL = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36";
const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 15; Pixel Tablet) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

describe("android phone detection", () => {
  it("accepts Android phones only", () => {
    expect(isAndroidPhone(PIXEL)).toBe(true);
    expect(isAndroidPhone(ANDROID_TABLET)).toBe(false);
    expect(isAndroidPhone(DESKTOP)).toBe(false);
    expect(isAndroidPhone(IPHONE)).toBe(false);
    expect(isAndroidPhone(null)).toBe(false);
  });
});

describe("download route", () => {
  it("redirects an Android phone to the release asset", () => {
    const response = GET(new Request("http://localhost/api/download", { headers: { "user-agent": PIXEL } }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(ANDROID_APK_URL);
  });

  it("refuses everything else with a typed error", async () => {
    const response = GET(new Request("http://localhost/api/download", { headers: { "user-agent": DESKTOP } }));
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("mobile_only");
  });
});
