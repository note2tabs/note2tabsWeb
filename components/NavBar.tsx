import { stripLocale } from "../lib/i18n/locale";
import { localizedSignIn as signIn } from "../lib/i18n/auth";
import { useLocale } from "../lib/i18n/react";
import Link from "./LocaleLink";
import { useEffect, useRef, useState } from "react";
import { useLocaleRouter as useRouter } from "../lib/i18n/react";
import { useSession, signOut } from "next-auth/react";
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

type PrimaryNavSection = "home" | "editor" | "transcriber" | "premium";

export const ADMIN_NAV_ITEMS = [
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/affiliates", label: "Affiliates & coupons" },
  { href: "/admin/blog", label: "Blog" },
  { href: "/mod/users", label: "Users" },
  { href: "/mod/dashboard", label: "Moderation" },
] as const;

export const isPrimaryNavSectionActive = (
  pathname: string,
  section: PrimaryNavSection
) => {
  if (section === "home") return pathname === "/home";
  if (section === "editor") return pathname === "/editor" || pathname.startsWith("/gte");
  if (section === "transcriber") {
    return (
      pathname === "/transcribe" ||
      pathname === "/transcriber" ||
      pathname.startsWith("/job/")
    );
  }
  return pathname === "/pricing";
};

export const shouldShowPremiumNav = (
  sessionStatus: "loading" | "authenticated" | "unauthenticated",
  hasSession: boolean,
  hasPremiumAccess: boolean
) =>
  sessionStatus !== "loading" && (!hasSession || !hasPremiumAccess);

export default function NavBar({ editorRevealMode = false }: NavBarProps) {
  const { t, locale, href: localePath } = useLocale();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
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
  const isHome = stripLocale(router.pathname) === "/";
  const isProductHome = router.pathname === "/home";
  const role = session?.user?.role || "";
  const isAdmin = role === "ADMIN";
  const hasPremiumAccess = ["PREMIUM", "ADMIN", "MODERATOR", "MOD"].includes(role);
  const premiumHref = "/pricing?source=navigation&reason=nav_premium";
  const editorHref = sessionStatus === "authenticated" ? "/gte" : "/editor";
  const logoHref = sessionStatus === "authenticated" ? "/home" : "/";
  const navPillClass = (section: PrimaryNavSection, extraClass = "") =>
    `nav-pill${extraClass ? ` ${extraClass}` : ""}${
      isPrimaryNavSectionActive(stripLocale(router.pathname), section) ? " nav-pill--active" : ""
    }`;

  useEffect(() => {
    setMenuOpen(false);
    setProfileMenuOpen(false);
    setAdminMenuOpen(false);
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
      const revealThreshold = editorMouseNearTopRef.current ? 64 : 20;
      editorMouseNearTopRef.current = event.clientY <= revealThreshold;
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
        setAdminMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
        setAdminMenuOpen(false);
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
      data-nosnippet
      className={`nav-shell${isReadingArticle ? " nav-shell--reading" : ""}${isHome ? " nav-shell--home" : ""}${isHome && !isScrolled ? " nav-shell--blend" : ""}${editorRevealMode ? " nav-shell--editor-reveal" : ""}${editorRevealMode && (editorRevealVisible || menuOpen || profileMenuOpen) ? " nav-shell--editor-visible" : ""}${profileMenuOpen ? " nav-shell--profile-open" : ""}`}
    >
      <div className="container nav">
        <Link href={logoHref} className="logo">
          <img src="/logo-mark-96.png" alt="Note2Tabs logo" className="logo-mark" width="28" height="28" />
          <span className="logo-text">Note2Tabs</span>
        </Link>
        <nav
          id="primary-navigation"
          className={`nav-links ${menuOpen ? "open" : ""}${isReadingArticle ? " nav-links--reading" : ""}`}
          aria-label={t("Primary navigation")}
        >
          {(sessionStatus === "authenticated" || isProductHome) && (
            <Link
              href="/home"
              className={navPillClass("home")}
              aria-current={isProductHome ? "page" : undefined}
            >{t(" Home ")}</Link>
          )}
          <Link
            href={editorHref}
            className={navPillClass("editor")}
            aria-current={isPrimaryNavSectionActive(stripLocale(router.pathname), "editor") ? "page" : undefined}
          >{t(" Editor ")}</Link>
          <Link
            href="/transcribe"
            className={navPillClass("transcriber")}
            aria-current={isPrimaryNavSectionActive(stripLocale(router.pathname), "transcriber") ? "page" : undefined}
          >{t(" Transcriber ")}</Link>
          {shouldShowPremiumNav(sessionStatus, Boolean(session), hasPremiumAccess) && (
            <Link
              href={session ? premiumHref : "/pricing"}
              className={navPillClass("premium", session ? "nav-premium-link" : "")}
              aria-current={isPrimaryNavSectionActive(stripLocale(router.pathname), "premium") ? "page" : undefined}
            >
              {session ? "Premium" : t("Pricing")}
            </Link>
          )}
          <div
            className={`nav-auth-slot${
              sessionStatus === "loading"
                ? " nav-auth-slot--loading"
                : session
                  ? " nav-auth-slot--profile"
                  : " nav-auth-slot--guest"
            }`}
          >
            {sessionStatus === "loading" && (
              <span className="nav-session-loading" role="status" aria-label={t("Checking sign-in status")} />
            )}
            {sessionStatus === "unauthenticated" && (
              <>
                <button type="button" onClick={() => signIn(undefined, { callbackUrl: "/home" })}>{t(" Log in ")}</button>
                <Link href="/auth/signup" className="nav-cta">{t(" Start free ")}</Link>
              </>
            )}
            {session && (
              <div className="nav-profile" ref={profileMenuRef}>
                <button
                  type="button"
                  className={`nav-profile-toggle${profileMenuOpen ? " open" : ""}`}
                  aria-label={t("Open settings menu")}
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  aria-controls="nav-profile-menu"
                  onClick={() => {
                    setProfileMenuOpen((prev) => !prev);
                    setAdminMenuOpen(false);
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
                  {!hasPremiumAccess && (
                    <Link
                      href={premiumHref}
                      className="nav-profile-menu__premium"
                      role="menuitem"
                      onClick={() => setProfileMenuOpen(false)}
                    >{t(" Explore Premium ")}</Link>
                  )}
                  <Link href="/home" role="menuitem" onClick={() => setProfileMenuOpen(false)}>{t(" Home ")}</Link>
                  <Link href="/gte" role="menuitem" onClick={() => setProfileMenuOpen(false)}>{t(" My editors ")}</Link>
                  {isAdmin && (
                    <div className="nav-admin-tools" role="none">
                      <button
                        type="button"
                        className="nav-admin-tools__toggle"
                        role="menuitem"
                        aria-haspopup="menu"
                        aria-expanded={adminMenuOpen}
                        aria-controls="nav-admin-tools-menu"
                        onClick={() => setAdminMenuOpen((open) => !open)}
                      >
                        <span>{t("Admin tools")}</span>
                        <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                          <path d="m3 4.5 3 3 3-3" />
                        </svg>
                      </button>
                      {adminMenuOpen && (
                        <div id="nav-admin-tools-menu" className="nav-admin-tools__menu" role="menu">
                          {ADMIN_NAV_ITEMS.map((item) => (
                            <Link
                              key={item.href}
                              href={item.href}
                              role="menuitem"
                              aria-current={router.pathname === item.href ? "page" : undefined}
                              onClick={() => {
                                setAdminMenuOpen(false);
                                setProfileMenuOpen(false);
                              }}
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <Link href="/settings" role="menuitem" onClick={() => setProfileMenuOpen(false)}>{t(" Settings ")}</Link>
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
                        setSignOutError(t("Could not securely clear your saved upload. Please try signing out again."));
                        setSignOutBusy(false);
                        return;
                      }
                      try {
                        await resetPostHogIdentity();
                        await signOut({ redirect: false });
                        window.location.href = "/";
                      } catch {
                        setSignOutError(t("Could not sign out. Check your connection and try again."));
                        setSignOutBusy(false);
                      }
                    }}
                  >
                    {signOutBusy ? t("Signing out…") : t("Sign out")}
                  </button>
                  {signOutError && (
                    <div role="none">
                      <span className="error" role="alert">{signOutError}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </nav>
        <div className="nav-actions">
          <button
            ref={menuButtonRef}
            className="menu-toggle"
            type="button"
            onClick={() => {
              setMenuOpen((prev) => !prev);
              setProfileMenuOpen(false);
            }}
            aria-label={menuOpen ? t("Close menu") : t("Open menu")}
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
          >{t(" Menu ")}</button>
        </div>
      </div>
    </header>
  );
}
