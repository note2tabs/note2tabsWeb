import Link from "next/link";
import { useSession } from "next-auth/react";
export function PricingHeader() {
  const { status } = useSession();
  return <header className="pricing-header"><Link href="/" className="logo">Note2Tabs</Link>
    <Link href={status === "authenticated" ? "/settings" : "/auth/login?next=%2Fpricing"}>{status === "authenticated" ? "Your account" : "Log in"}</Link>
  </header>;
}
export function PricingFooter() {
  return <footer className="pricing-footer"><a href="mailto:support@note2tabs.com">Support</a><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/settings#privacy-controls">Analytics settings</Link></footer>;
}
