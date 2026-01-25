import Link from "next/link";

export default function FooterBar() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer-shell">
      <div className="container footer-content">
        <span>(c) {year} Note2Tabs</span>
        <div className="footer-links">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
