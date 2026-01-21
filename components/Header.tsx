import Link from "next/link";

export default function Header() {
  return (
    <header className="nav-shell">
      <div className="container nav">
        <Link href="/" className="logo">
          Note2Tab
        </Link>
        <nav className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/account">Account</Link>
        </nav>
      </div>
    </header>
  );
}
