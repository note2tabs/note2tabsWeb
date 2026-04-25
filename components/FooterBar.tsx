import Link from "next/link";

export default function FooterBar() {
  const openCookieSettings = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new Event("note2tabs:open-cookie-settings"));
  };

  return (
    <footer className="footer-shell">
      <div className="container footer-layout">
        <div className="footer-socials" aria-label="Social links">
          <a
            href="https://instagram.com/note2tabs"
            target="_blank"
            rel="noreferrer"
            className="footer-social-link"
            aria-label="Instagram"
            title="Instagram"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7.75 2A5.75 5.75 0 0 0 2 7.75v8.5A5.75 5.75 0 0 0 7.75 22h8.5A5.75 5.75 0 0 0 22 16.25v-8.5A5.75 5.75 0 0 0 16.25 2zm0 1.5h8.5a4.25 4.25 0 0 1 4.25 4.25v8.5a4.25 4.25 0 0 1-4.25 4.25h-8.5a4.25 4.25 0 0 1-4.25-4.25v-8.5A4.25 4.25 0 0 1 7.75 3.5M17.5 5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10m0 1.5A3.5 3.5 0 1 1 8.5 12 3.5 3.5 0 0 1 12 8.5" />
            </svg>
          </a>
          <a
            href="https://tiktok.com/@note2tabs"
            target="_blank"
            rel="noreferrer"
            className="footer-social-link"
            aria-label="TikTok"
            title="TikTok"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.5 3v2.6c.7 1.1 1.8 1.9 3.1 2.3v3.1c-1.2-.1-2.2-.5-3.1-1.1v6.1a4.7 4.7 0 1 1-4.7-4.7c.2 0 .4 0 .6.1V14a2 2 0 1 0 1.4 1.9V3z" />
            </svg>
          </a>
          <a
            href="https://youtube.com/@note2tabs"
            target="_blank"
            rel="noreferrer"
            className="footer-social-link"
            aria-label="YouTube"
            title="YouTube"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22 12c0-2.2-.2-3.7-.6-4.6a2.8 2.8 0 0 0-1.6-1.6C18.9 5.4 17.4 5.2 12 5.2S5.1 5.4 4.2 5.8a2.8 2.8 0 0 0-1.6 1.6C2.2 8.3 2 9.8 2 12s.2 3.7.6 4.6a2.8 2.8 0 0 0 1.6 1.6c.9.4 2.4.6 7.8.6s6.9-.2 7.8-.6a2.8 2.8 0 0 0 1.6-1.6c.4-.9.6-2.4.6-4.6m-12.5 3.5v-7l6 3.5z" />
            </svg>
          </a>
        </div>

        <div className="footer-sections">
          <section className="footer-section">
            <h3>Terms & Policies</h3>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <button type="button" onClick={openCookieSettings} className="footer-link-button">
              Cookie settings
            </button>
          </section>

          <section className="footer-section">
            <h3>Contact</h3>
            <a href="mailto:note2tabs@gmail.com">note2tabs@gmail.com</a>
          </section>

          <section className="footer-section">
            <h3>Products</h3>
            <Link href="/transcriber">Transcriber</Link>
            <Link href="/gte">Editor</Link>
          </section>

          <section className="footer-section">
            <h3>Resources</h3>
            <Link href="/about">About us</Link>
            <Link href="/blog">Blog</Link>
            <Link href="/blog/tag/tutorial">Tutorials</Link>
          </section>
        </div>
      </div>
    </footer>
  );
}
