import Link from "next/link";

export default function FooterBar() {
  const year = new Date().getFullYear();
  const openCookieSettings = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("note2tabs:open-cookie-settings"));
  };

  return (
    <footer className="footer-shell">
      <div className="container footer-content">
        <div className="footer-brand">
          <img src="/logo01black.png" alt="Note2Tabs logo" className="footer-logo" />
          <span>(c) {year} Note2Tabs</span>
        </div>
        <div className="footer-links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <button
            type="button"
            onClick={openCookieSettings}
            style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: "inherit" }}
          >
            Cookie settings
          </button>
          <Link href="/contact">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
