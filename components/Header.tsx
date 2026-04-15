import Link from "next/link";

export default function Header() {
  return (
    <header className="nav-shell">
      <div className="container nav">
        <Link href="/" className="logo">
          <img src="/logo01black.png" alt="Note2Tabs logo" className="logo-mark" />
          <span className="logo-text">Note2Tabs</span>
        </Link>
        <nav className="nav-links">
          <Link href="/gte" className="nav-pill">
            Editor
          </Link>
          <Link href="/transcriber" className="nav-pill">
            Transcriber
          </Link>
          <Link href="/">Home</Link>
          <Link href="/account">Account</Link>
        </nav>
      </div>
    </header>
  );
}
