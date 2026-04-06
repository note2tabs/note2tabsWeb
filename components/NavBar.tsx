import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const isReadingArticle = router.pathname === "/blog/[slug]";
  const role = session?.user?.role || "";
  const isAdmin = role === "ADMIN";
  const isModerator = role === "MODERATOR" || role === "MOD";
  const analyticsHref = isAdmin
    ? "/admin/analytics?view=overview&range=30d"
    : "/admin/analytics?view=moderation&range=30d";
  const analyticsLabel = isAdmin ? "Analytics" : "Moderation";
  const initial =
    session?.user?.email?.[0]?.toUpperCase() ||
    session?.user?.name?.[0]?.toUpperCase() ||
    "N";

  useEffect(() => {
    setMenuOpen(false);
    setProfileMenuOpen(false);
  }, [router.asPath]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (profileMenuRef.current && target && !profileMenuRef.current.contains(target)) {
        setProfileMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileMenuOpen]);

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
          <Link href="/editor" className="nav-pill">
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
        </nav>
        <div className="nav-actions">
          {session && (
            <div className="nav-profile" ref={profileMenuRef}>
              <button
                type="button"
                className={`nav-profile-toggle${profileMenuOpen ? " open" : ""}`}
                aria-label="Open account menu"
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                aria-controls="nav-profile-menu"
                onClick={() => {
                  setProfileMenuOpen((prev) => !prev);
                  setMenuOpen(false);
                }}
                title={roleLabel(session.user?.role)}
              >
                <div className="nav-chip">{initial}</div>
              </button>
              <div
                id="nav-profile-menu"
                className={`nav-profile-menu${profileMenuOpen ? " open" : ""}`}
                role="menu"
              >
                <Link href="/account" role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                  Account
                </Link>
                <Link href="/settings" role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                  Settings
                </Link>
                <Link href="/tabs" role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                  Saved tabs
                </Link>
                {(isAdmin || isModerator) && (
                  <Link href={analyticsHref} role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                    {analyticsLabel}
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setProfileMenuOpen(false);
                    await signOut({ redirect: false });
                    window.location.href = "/";
                  }}
                >
                  Sign out
                </button>
              </div>
            </div>
          )}
          <button
            className="menu-toggle"
            type="button"
            onClick={() => {
              setMenuOpen((prev) => !prev);
              setProfileMenuOpen(false);
            }}
            aria-label="Toggle menu"
          >
            Menu
          </button>
        </div>
      </div>
    </header>
  );
}
