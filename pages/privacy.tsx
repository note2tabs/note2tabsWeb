export default function PrivacyPage() {
  return (
    <main className="page">
      <div className="container stack" style={{ maxWidth: "820px" }}>
        <h1 className="page-title">Privacy Policy</h1>
        <p className="page-subtitle">
          We store account data and transcription history in a database via Prisma. Audio is sent to our
          processing backend for transcription. Only upload content you have rights to.
        </p>
        <h2>Access to Your Tabs and Content</h2>
        <p className="muted text-small">
          Tabs, transcriptions, and related metadata are stored so the Service works. Our team may access
          created tabs and related content to provide support, troubleshoot issues, prevent abuse, and comply
          with legal obligations.
        </p>
        <p className="muted text-small">
          Security logging (server errors, IP addresses for abuse prevention) may be recorded in server logs.
          This logging does not depend on consent and is used solely to protect the service.
        </p>
        <h2>Cookies and Similar Technologies</h2>
        <p className="muted text-small">
          We use cookies to run the Service and to measure usage and improve performance. Analytics is enabled
          by default unless you explicitly deny it from the banner or settings.
        </p>
        <ul className="muted text-small">
          <li>
            Essential cookies: authentication and session cookies required to sign in and keep your account
            secure.
          </li>
          <li>
            Consent cookie: <strong>analytics_consent</strong> stores your analytics preference.
          </li>
          <li>
            Analytics session cookie: <strong>analytics_session</strong> stores a random session identifier to
            measure site usage. It is set for up to 24 hours.
          </li>
          <li>
            Anonymous analytics cookie: <strong>analytics_anon</strong> stores a random identifier used to
            connect related events for up to 90 days.
          </li>
        </ul>
        <p className="muted text-small">
          With analytics enabled, we may collect page views, events, device type, browser, approximate
          location (derived from an IP hash), session identifiers, and a server-salted hash of device
          fingerprint data to improve Note2Tabs and prevent abuse.
        </p>
        <p className="muted text-small">
          You can deny analytics and continue using basic features (subject to rate limits/security). You can
          manage this later from cookie settings, delete cookies in your browser, and request account deletion
          at any time.
        </p>
      </div>
    </main>
  );
}
