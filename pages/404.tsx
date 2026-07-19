import Link from "next/link";
import NoIndexHead from "../components/NoIndexHead";

export default function NotFoundPage() {
  return (
    <>
      <NoIndexHead title="Page not found | Note2Tabs" canonicalPath="/404" description="This Note2Tabs page could not be found." />
      <main className="page recovery-page">
        <div className="container recovery-card">
          <p className="hero-eyebrow">404 — wrong fret</p>
          <h1>That page is out of tune.</h1>
          <p>The link may be old, or the page may have moved. Your next riff is still close by.</p>
          <div className="button-row">
            <Link href="/" className="button-primary">Go home</Link>
            <Link href="/transcribe" className="button-secondary">Open transcriber</Link>
            <Link href="/editor" className="button-secondary">Try the editor</Link>
          </div>
        </div>
      </main>
    </>
  );
}
