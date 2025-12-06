import Link from "next/link";

export default function Header() {
  return (
    <header className="w-full border-b border-slate-900 bg-slate-950/90 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="text-sm font-semibold hover:text-white">
          Note2Tabs
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <Link href="/history" className="hover:text-white">
            History
          </Link>
        </nav>
      </div>
    </header>
  );
}
