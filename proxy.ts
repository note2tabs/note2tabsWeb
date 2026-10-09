import {LANGUAGE_CHOICE_COOKIE} from "./lib/i18n/preference";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { DISPLAY_CURRENCY_COOKIE, displayCurrencyForCountry } from "./lib/localizedPricing";
import { localeFromPath } from "./lib/i18n/locale";
import { detectedLocaleDestination } from "./lib/i18n/detection";
import { localizedPilotAvailable } from "./lib/i18n/pilot";

const withCurrencyPreference = (request: NextRequest, response: NextResponse) => {
  const country = request.headers.get("x-vercel-ip-country");
  if (!country) return response;
  response.cookies.set({
    name: DISPLAY_CURRENCY_COOKIE,
    value: displayCurrencyForCountry(country),
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
  return response;
};

export default async function proxy(request: NextRequest) {
  const localizedPath = ["GET", "HEAD"].includes(request.method) ? detectedLocaleDestination(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    request.headers.get("accept-language") || "",
    request.cookies.get(LANGUAGE_CHOICE_COOKIE)?.value === "1" ? request.cookies.get("n2t_locale")?.value : undefined,
    request.headers.get("user-agent") || "",
    localizedPilotAvailable, request.cookies.get(LANGUAGE_CHOICE_COOKIE)?.value === "1",
  ) : null;
  if (localizedPath) {
    const destination = new URL(localizedPath, request.url);
    const response = NextResponse.redirect(destination);
    response.headers.set("Vary", "Accept-Language, Cookie");
    response.headers.set("Cache-Control", "private, no-store");
    return withCurrencyPreference(request, response);
  }
  if (localeFromPath(request.nextUrl.pathname) !== "en" || request.nextUrl.pathname === "/pricing") {
    return withCurrencyPreference(request, NextResponse.next());
  }
  if (request.nextUrl.pathname !== "/") return withCurrencyPreference(request, NextResponse.next());
  // Authentication handoffs use the public transcriber to restore a pending
  // upload. They must finish before the normal signed-in home redirect.
  if (request.nextUrl.searchParams.get("resumeTranscription") === "1") {
    return withCurrencyPreference(request, NextResponse.next());
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return withCurrencyPreference(request, NextResponse.next());

  const token = await getToken({ req: request, secret }).catch(() => null);
  if (!token) return withCurrencyPreference(request, NextResponse.next());

  const destination = request.nextUrl.clone();
  destination.pathname = "/home";
  destination.search = "";
  return withCurrencyPreference(request, NextResponse.redirect(destination));
}

export const config = {
  matcher: [
    "/", "/pricing", "/transcribe", "/editor", "/online-guitar-tab-editor", "/about", "/contact", "/terms", "/privacy",
    "/settings", "/home", "/shared", "/tabs/:path*", "/account", "/history", "/affiliate", "/auth/:path*", "/reset-password/:path*", "/job/:path*", "/premium/welcome", "/email/:path*",
    "/affiliate-program", "/internship-application", "/features/:path*", "/blog/:path*",
    "/audio-to-guitar-tab-converter", "/mp3-to-guitar-tabs", "/youtube-to-guitar-tabs", "/ai-guitar-tab-generator", "/free-guitar-tab-maker",
    "/pt-br/:path*", "/es/:path*", "/ja/:path*", "/ko/:path*", "/pl/:path*", "/ar/:path*", "/zh-hans/:path*",
  ],
};
