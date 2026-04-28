import SeoHead from "../components/SeoHead";

export default function PrivacyPage() {
  return (
    <>
      <SeoHead
        title="Privacy Policy | Note2Tabs"
        description="Read how Note2Tabs handles account data, transcription history, uploaded audio, cookies, analytics, and security logging."
        canonicalPath="/privacy"
      />
      <main className="page legal-page">
        <div className="legal-shell">
          <header className="legal-header">
            <p className="legal-kicker">Privacy</p>
            <h1 className="page-title">Privacy Policy</h1>
            <p className="page-subtitle">
              We store account data and transcription history so Note2Tabs works reliably. Audio is sent to our
              processing backend for transcription. Only upload content you have rights to use.
            </p>
          </header>

          <section className="legal-prose">
          <h2>Access to your tabs and content</h2>
          <p>
            Tabs, transcriptions, and related metadata are stored so the service works. Our team may access created
            tabs and related content to provide support, troubleshoot issues, prevent abuse, and comply with legal
            obligations.
          </p>
          <p>
            Security logging (including server errors and IP addresses for abuse prevention) may be recorded in
            server logs. This logging does not depend on analytics consent and is used solely to protect the service.
          </p>

          <h2>Cookies and similar technologies</h2>
          <p>
            We use cookies to run the service and to measure usage and improve performance. Analytics is enabled by
            default unless you explicitly deny it from the cookie settings button in the footer or from settings.
          </p>
          <ul>
            <li>
              Essential cookies: authentication and session cookies required to sign in and keep your account secure.
            </li>
            <li>
              Consent cookie: <strong>analytics_consent</strong> stores your analytics preference.
            </li>
            <li>
              Analytics session cookie: <strong>analytics_session</strong> stores a random session identifier for up
              to 24 hours.
            </li>
            <li>
              Anonymous analytics cookie: <strong>analytics_anon</strong> stores a random identifier for up to 90
              days.
            </li>
          </ul>
          <p>
            With analytics enabled, we may collect page views, events, device type, browser, approximate location
            (derived from an IP hash), session identifiers, and a server-salted hash of device fingerprint data to
            improve Note2Tabs and prevent abuse.
          </p>
          <p>
            You can deny analytics and continue using core features (subject to rate limits and security protections).
            You can update this later in settings, clear cookies in your browser, and request account deletion at any
            time.
          </p>
          </section>
        </div>
      </main>
    </>
  );
}
