import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { DISPLAY_CURRENCY_COOKIE, displayCurrencyForCountry } from "./lib/localizedPricing";

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
  if (request.nextUrl.pathname.startsWith("/pt-br") || request.nextUrl.pathname === "/pricing") {
    return withCurrencyPreference(request, NextResponse.next());
  }
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
  matcher: ["/", "/pricing", "/pt-br", "/pt-br/pricing"],
};
