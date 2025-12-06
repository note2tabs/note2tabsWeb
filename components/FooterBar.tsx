import Link from "next/link";

export default function FooterBar() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-900 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 text-xs text-slate-500">
        <span>© {year} Note2Tabs</span>
        <div className="flex items-center gap-3">
          <Link href="/terms" className="hover:text-slate-200">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-slate-200">
            Privacy
          </Link>
          <Link href="/contact" className="hover:text-slate-200">
            Contact
          </Link>
        </div>
      </div>
    </footer>
  );
}
