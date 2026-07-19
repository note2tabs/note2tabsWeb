import Link from "next/link";
import NoIndexHead from "../components/NoIndexHead";

export default function ServerErrorPage() {
  return (
    <>
      <NoIndexHead title="Something went wrong | Note2Tabs" canonicalPath="/500" description="Note2Tabs hit a temporary error." />
      <main className="page recovery-page">
        <div className="container recovery-card">
          <p className="hero-eyebrow">Temporary error</p>
          <h1>We dropped a note.</h1>
          <p>Try the page again. If the problem continues, return home and restart the flow.</p>
          <div className="button-row">
            <button type="button" className="button-primary" onClick={() => window.location.reload()}>Try again</button>
            <Link href="/" className="button-secondary">Go home</Link>
          </div>
        </div>
      </main>
    </>
  );
}
