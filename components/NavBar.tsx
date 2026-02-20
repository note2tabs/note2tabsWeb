import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn, signOut } from "next-auth/react";

const roleLabel = (role?: string) => {
  if (!role) return "Free";
  if (role === "ADMIN") return "Admin";
  if (role === "MODERATOR" || role === "MOD") return "Moderator";
  if (role === "PREMIUM") return "Premium";
  return "Free";
};

export default function NavBar() {
  const router = useRouter();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const isReadingArticle = router.pathname === "/blog/[slug]";
  const editorHref = session?.user?.id ? "/gte" : "/gte/local";
  const initial =
    session?.user?.email?.[0]?.toUpperCase() ||
    session?.user?.name?.[0]?.toUpperCase() ||
    "N";

  return (
    <header className={`nav-shell${isReadingArticle ? " nav-shell--reading" : ""}`}>
      <div className="container nav">
        <Link href="/" className="logo">
          <img src="/logo01black.png" alt="Note2Tabs logo" className="logo-mark" />
          <span className="logo-text">Note2Tabs</span>
        </Link>
        <nav
          className={`nav-links ${menuOpen ? "open" : ""}${isReadingArticle ? " nav-links--reading" : ""}`}
        >
          <Link href={editorHref} className="nav-pill">
            Editor
          </Link>
          <Link href="/transcriber" className="nav-pill">
            Transcriber
          </Link>
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
              <button
                type="button"
                onClick={async () => {
                  await signOut({ redirect: false });
                  window.location.href = "/";
                }}
              >
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
