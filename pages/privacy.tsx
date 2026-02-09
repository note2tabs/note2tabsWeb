export default function PrivacyPage() {
  return (
    <main className="page">
      <div className="container stack" style={{ maxWidth: "820px" }}>
        <h1 className="page-title">Privacy Policy</h1>
        <p className="page-subtitle">
          We store authentication and transcription history in a database via Prisma. Audio is sent to our
          processing backend for transcription. Only upload content you have rights to.
        </p>
        <p className="muted text-small">
          Security logging (server errors, IP addresses for abuse prevention) may be recorded in server logs.
          This logging does not depend on consent and is used solely to protect the service.
        </p>
        <p className="muted text-small">
          Analytics and device fingerprinting only start after you accept cookies in the banner. With consent,
          we may collect page views, events, device type, browser, approximate location (derived from IP
          hash), session identifiers, and optional fingerprint IDs to improve Note2Tab and prevent abuse.
          Without consent, only minimal security logging is performed.
        </p>
        <p className="muted text-small">
          You can decline analytics and continue using basic features (subject to rate limits/security). You
          may request account deletion at any time.
        </p>
      </div>
    </main>
  );
}
