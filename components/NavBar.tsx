import Link from "next/link";
import { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { APP_HOME_URL } from "../lib/urls";

const roleLabel = (role?: string) => {
  if (!role) return "Free";
  if (role === "ADMIN") return "Admin";
  if (role === "MODERATOR" || role === "MOD") return "Moderator";
  if (role === "PREMIUM") return "Premium";
  return "Free";
};

export default function NavBar() {
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const initial =
    session?.user?.email?.[0]?.toUpperCase() ||
    session?.user?.name?.[0]?.toUpperCase() ||
    "N";

  return (
    <header className="nav-shell">
      <div className="container nav">
        <Link href="/" className="logo">
          Note2Tabs
        </Link>
        <nav className={`nav-links ${menuOpen ? "open" : ""}`}>
          <a href="/#how">How it works</a>
          <a href="/#pricing">Pricing</a>
          {!session && (
            <>
              <button type="button" onClick={() => signIn(undefined, { callbackUrl: "/" })}>
                Log in
              </button>
              <Link href="/auth/signup" className="nav-cta">
                Start free
              </Link>
            </>
          )}
          {session && (
            <>
              <Link href="/account">Account</Link>
              {session.user?.role === "ADMIN" && <Link href="/admin/analytics">Admin</Link>}
              {session.user?.role === "MODERATOR" || session.user?.role === "MOD" ? (
                <Link href="/mod/dashboard">Moderation</Link>
              ) : null}
              <button type="button" onClick={() => signOut({ callbackUrl: APP_HOME_URL })}>
                Sign out
              </button>
            </>
          )}
        </nav>
        <div className="nav-actions">
          {session && (
            <div className="nav-chip" title={roleLabel(session.user?.role)}>
              {initial}
            </div>
          )}
          <button
            className="menu-toggle"
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
          >
            Menu
          </button>
        </div>
      </div>
    </header>
  );
}
