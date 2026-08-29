import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

export default async function proxy(request: NextRequest) {
  const responseWithRegion = (response: NextResponse) => {
    const country = (request.headers.get("x-vercel-ip-country") || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(country)) {
      response.cookies.set("note2tabs_region", country, {
        httpOnly: false,
        maxAge: 24 * 60 * 60,
        path: "/",
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      });
    }
    return response;
  };

  // Authentication handoffs use the public transcriber to restore a pending
  // upload. They must finish before the normal signed-in home redirect.
  if (request.nextUrl.searchParams.get("resumeTranscription") === "1") {
    return responseWithRegion(NextResponse.next());
  }

  if (request.nextUrl.pathname !== "/") {
    return responseWithRegion(NextResponse.next());
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return responseWithRegion(NextResponse.next());

  const token = await getToken({ req: request, secret }).catch(() => null);
  if (!token) return responseWithRegion(NextResponse.next());

  const destination = request.nextUrl.clone();
  destination.pathname = "/home";
  destination.search = "";
  return responseWithRegion(NextResponse.redirect(destination));
}

export const config = {
  matcher: ["/", "/gte/:path*", "/job/:path*"],
};
