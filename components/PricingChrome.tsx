import Link from "next/link";
export function PricingFooter() {
  return <footer className="pricing-footer"><a href="mailto:support@note2tabs.com">Support</a><Link href="/terms">Terms</Link><Link href="/privacy">Privacy</Link><Link href="/settings#privacy-controls">Analytics settings</Link></footer>;
}
