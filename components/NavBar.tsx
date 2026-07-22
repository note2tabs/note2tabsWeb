import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn, signOut } from "next-auth/react";
import { clearPendingTranscription } from "../lib/pendingTranscription";
import { resetPostHogIdentity } from "../lib/posthogClient";

const roleLabel = (role?: string) => {
  if (!role) return "Free";
  if (role === "ADMIN") return "Admin";
  if (role === "MODERATOR" || role === "MOD") return "Moderator";
  if (role === "PREMIUM") return "Premium";
  return "Free";
};

type NavBarProps = {
  editorRevealMode?: boolean;
};

export default function NavBar({ editorRevealMode = false }: NavBarProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [editorRevealVisible, setEditorRevealVisible] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrolledRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const editorMouseNearTopRef = useRef(false);
  const editorAtPageTopRef = useRef(true);
  const isReadingArticle = router.pathname === "/blog/[slug]";
  const isHome = router.pathname === "/";
  const role = session?.user?.role || "";
  const isAdmin = role === "ADMIN";
  const editorHref = session ? "/gte" : "/editor";

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
    if (!editorRevealMode || typeof window === "undefined") {
      setEditorRevealVisible(false);
      return;
    }

    const updateRevealState = () => {
      setEditorRevealVisible(editorAtPageTopRef.current && editorMouseNearTopRef.current);
    };
    const handleMouseMove = (event: MouseEvent) => {
      editorMouseNearTopRef.current = event.clientY <= 72;
      updateRevealState();
    };
    const handleScroll = () => {
      editorAtPageTopRef.current = window.scrollY <= 2;
      updateRevealState();
    };

    editorAtPageTopRef.current = window.scrollY <= 2;
    editorMouseNearTopRef.current = false;
    updateRevealState();
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [editorRevealMode]);

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

  useEffect(() => {
    if (!menuOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [menuOpen]);

  return (
    <header
      className={`nav-shell${isReadingArticle ? " nav-shell--reading" : ""}${isHome ? " nav-shell--home" : ""}${isHome && !isScrolled ? " nav-shell--blend" : ""}${editorRevealMode ? " nav-shell--editor-reveal" : ""}${editorRevealMode && (editorRevealVisible || menuOpen || profileMenuOpen) ? " nav-shell--editor-visible" : ""}`}
    >
      <div className="container nav">
        <Link href="/" className="logo">
          <img src="/logo-mark-96.png" alt="Note2Tabs logo" className="logo-mark" width="28" height="28" />
          <span className="logo-text">Note2Tabs</span>
        </Link>
        <nav
          id="primary-navigation"
          className={`nav-links ${menuOpen ? "open" : ""}${isReadingArticle ? " nav-links--reading" : ""}`}
          aria-label="Primary navigation"
        >
          <Link href={editorHref} className="nav-pill">
            Editor
          </Link>
          <Link href="/transcribe" className="nav-pill">
            Transcriber
          </Link>
          <Link href="/pricing">Pricing</Link>
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
                <Link href="/gte" role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                  My editors
                </Link>
                {isAdmin && (
                  <Link href="/admin/analytics" role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                    Analytics
                  </Link>
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={signOutBusy}
                  onClick={async () => {
                    if (signOutBusy) return;
                    setSignOutBusy(true);
                    setSignOutError(null);
                    try {
                      await clearPendingTranscription();
                    } catch {
                      setSignOutError("Could not securely clear your saved upload. Please try signing out again.");
                      setSignOutBusy(false);
                      return;
                    }
                    try {
                      await resetPostHogIdentity();
                      await signOut({ redirect: false });
                      window.location.href = "/";
                    } catch {
                      setSignOutError("Could not sign out. Check your connection and try again.");
                      setSignOutBusy(false);
                    }
                  }}
                >
                  {signOutBusy ? "Signing out…" : "Sign out"}
                </button>
                {signOutError && (
                  <div role="none">
                    <span className="error" role="alert">{signOutError}</span>
                  </div>
                )}
              </div>
            </div>
          )}
          <button
            ref={menuButtonRef}
            className="menu-toggle"
            type="button"
            onClick={() => {
              setMenuOpen((prev) => !prev);
              setProfileMenuOpen(false);
            }}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
          >
            Menu
          </button>
        </div>
      </div>
    </header>
  );
}
