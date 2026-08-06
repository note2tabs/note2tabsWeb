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

          <h2>Feedback and support messages</h2>
          <p>
            When you send product feedback, we store the message, a broad feedback category, the type of page it
            came from, the submission time, and a link to your account. We use this first-party information to answer
            support requests and improve Note2Tabs, even when optional analytics are disabled. We do not add the
            free-text message to PostHog, and feedback linked to your account is deleted when you delete the account.
          </p>

          <h2>Cookies and similar technologies</h2>
          <p>
            We use essential cookies to run the service. Product analytics are enabled by default, but PostHog is
            configured without persistent analytics cookies or local-storage identifiers. You can turn analytics off
            at any time from settings.
          </p>
          <ul>
            <li>
              Essential cookies: authentication and session cookies required to sign in and keep your account secure.
            </li>
            <li>An opt-out preference cookie is stored only when you turn analytics off.</li>
          </ul>
          <p>
            With analytics enabled, PostHog may collect page views, product events, device and browser information,
            approximate location, and a short-lived in-memory identifier to help us improve Note2Tabs. Anonymous
            identifiers do not persist across browser reloads. When you sign in, analytics activity may be associated
            with your Note2Tabs account ID.
          </p>
          <p>
            You can deny analytics and continue using core features (subject to rate limits and security protections).
            You can update this later in settings and request account deletion at any time.
          </p>
          </section>
        </div>
      </main>
    </>
  );
}
