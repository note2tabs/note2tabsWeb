import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

export default async function middleware(request: NextRequest) {
  // Authentication handoffs use the public transcriber to restore a pending
  // upload. They must finish before the normal signed-in home redirect.
  if (request.nextUrl.searchParams.get("resumeTranscription") === "1") {
    return NextResponse.next();
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return NextResponse.next();

  const token = await getToken({ req: request, secret }).catch(() => null);
  if (!token) return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.pathname = "/home";
  destination.search = "";
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/"],
};
