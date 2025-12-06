import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";

const roleLabel = (role?: string) => {
  if (!role) return "Free";
  if (role === "ADMIN") return "Admin";
  if (role === "MODERATOR" || role === "MOD") return "Moderator";
  if (role === "PREMIUM") return "Premium";
  return "Free";
};

export default function NavBar() {
  const { data: session } = useSession();
  const initial =
    session?.user?.email?.[0]?.toUpperCase() ||
    session?.user?.name?.[0]?.toUpperCase() ||
    "N";

  return (
    <header className="w-full border-b border-slate-900 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-slate-100 hover:text-white">
          <span className="text-sm font-semibold">Note2Tabs</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {!session && (
            <>
              <button
                type="button"
                onClick={() => signIn(undefined, { callbackUrl: "/" })}
                className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-100 hover:bg-slate-700"
              >
                Sign in
              </button>
              <Link
                href="/auth/signup"
                className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-500"
              >
                Sign up
              </Link>
            </>
          )}
          {session && (
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-slate-800 text-xs font-semibold text-slate-100 grid place-items-center">
                {initial}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs text-slate-300">{session.user?.email}</p>
                <p className="text-[11px] text-slate-500">{roleLabel(session.user?.role)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/account"
                  className="rounded-lg bg-slate-800 px-3 py-1.5 font-semibold text-slate-100 hover:bg-slate-700"
                >
                  My account
                </Link>
                {session.user?.role === "ADMIN" && (
                  <Link
                    href="/admin/analytics"
                    className="rounded-lg bg-amber-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-amber-400"
                  >
                    Admin
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
