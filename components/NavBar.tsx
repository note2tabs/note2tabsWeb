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
  const [isScrolled, setIsScrolled] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const isReadingArticle = router.pathname === "/blog/[slug]";
  const isHome = router.pathname === "/";
  const role = session?.user?.role || "";
  const isAdmin = role === "ADMIN";
  const isModerator = role === "MODERATOR" || role === "MOD";
  const analyticsHref = isAdmin
    ? "/admin/analytics?view=overview&range=30d"
    : "/admin/analytics?view=moderation&range=30d";
  const analyticsLabel = isAdmin ? "Analytics" : "Moderation";

  useEffect(() => {
    setMenuOpen(false);
    setProfileMenuOpen(false);
  }, [router.asPath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateScrollState = () => {
      const next = window.scrollY > 0;
      if (scrolledRef.current === next) return;
      scrolledRef.current = next;
      setIsScrolled(next);
    };
    const requestScrollUpdate = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        updateScrollState();
      });
    };
    updateScrollState();
    window.addEventListener("scroll", requestScrollUpdate, { passive: true });
    return () => {
      window.removeEventListener("scroll", requestScrollUpdate);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

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
    <header
      className={`nav-shell${isReadingArticle ? " nav-shell--reading" : ""}${isHome ? " nav-shell--home" : ""}${isHome && !isScrolled ? " nav-shell--blend" : ""}`}
    >
      <div className="container nav">
        <Link href="/" className="logo">
          <img src="/logo-mark-96.png" alt="Note2Tabs logo" className="logo-mark" width="28" height="28" />
          <span className="logo-text">Note2Tabs</span>
        </Link>
        <nav
          className={`nav-links ${menuOpen ? "open" : ""}${isReadingArticle ? " nav-links--reading" : ""}`}
        >
          <Link href="/gte" className="nav-pill">
            Editor
          </Link>
          <Link href="/#hero" className="nav-pill">
            Transcriber
          </Link>
          <a href="/#pricing">Pricing</a>
          <span
            className={`nav-auth-slot${session ? " nav-auth-slot--profile" : " nav-auth-slot--guest"}`}
            aria-hidden={session ? "true" : undefined}
          >
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
          </span>
        </nav>
        <div className="nav-actions">
          {session && (
            <div className="nav-profile" ref={profileMenuRef}>
              <button
                type="button"
                className={`nav-profile-toggle${profileMenuOpen ? " open" : ""}`}
                aria-label="Open settings menu"
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                aria-controls="nav-profile-menu"
                onClick={() => {
                  setProfileMenuOpen((prev) => !prev);
                  setMenuOpen(false);
                }}
                title={roleLabel(session.user?.role)}
              >
                <span className="nav-chip" aria-hidden="true">
                  <svg className="nav-chip-icon" viewBox="0 0 24 24" focusable="false">
                    <path d="M12 12.2c2.05 0 3.72-1.68 3.72-3.75S14.05 4.7 12 4.7 8.28 6.38 8.28 8.45s1.67 3.75 3.72 3.75Z" />
                    <path d="M5.75 19.3c.56-3.02 3.1-5.12 6.25-5.12s5.69 2.1 6.25 5.12c.06.31-.18.6-.5.6H6.25a.5.5 0 0 1-.5-.6Z" />
                  </svg>
                </span>
              </button>
              <div
                id="nav-profile-menu"
                className={`nav-profile-menu${profileMenuOpen ? " open" : ""}`}
                role="menu"
              >
                <Link href="/settings" role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                  Settings
                </Link>
                <Link href="/tabs" role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                  Transcriptions
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
