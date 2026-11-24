import { NextResponse } from "next/server";
import { ANDROID_APK_URL, MOBILE_ONLY_MESSAGE, isAndroidPhone } from "@/lib/download";

export const dynamic = "force-dynamic";

const HTTP_FORBIDDEN = 403;

export function GET(request: Request): NextResponse {
  if (!isAndroidPhone(request.headers.get("user-agent"))) {
    return NextResponse.json({ error: { code: "mobile_only", message: MOBILE_ONLY_MESSAGE } }, { status: HTTP_FORBIDDEN });
  }
  return NextResponse.redirect(ANDROID_APK_URL);
}
