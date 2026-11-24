export const ANDROID_APK_URL = "https://github.com/leojay-net/selvedge/releases/download/v0.1.0/selvedge-v0.1.0.apk";
export const MOBILE_ONLY_MESSAGE = "The Selvedge app can only be downloaded on an Android phone. Open this page on your phone to install it.";

const ANDROID_PATTERN = /Android/i;
const MOBILE_PATTERN = /\bMobile\b/i;

export function isAndroidPhone(userAgent: string | null): boolean {
  return userAgent !== null && ANDROID_PATTERN.test(userAgent) && MOBILE_PATTERN.test(userAgent);
}
