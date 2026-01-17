export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <h1 className="text-3xl font-semibold">Privacy Policy</h1>
        <p className="text-slate-300 text-sm">
          We store authentication and transcription history in our database via Prisma. Audio is sent to our
          secured FastAPI backend for processing. Only upload content you have rights to.
        </p>
        <p className="text-slate-300 text-sm">
          Security logging (server errors, IP addresses for abuse prevention) may be recorded in server logs.
          This logging does not depend on consent and is used solely to protect the service.
        </p>
        <p className="text-slate-300 text-sm">
          Analytics and device fingerprinting only start after you accept cookies in the banner. With consent,
          we may collect page views, events, device type, browser, approximate location (derived from IP
          hash), session identifiers, and optional fingerprint IDs to improve Note2Tabs and prevent abuse.
          Without consent, only minimal security logging is performed.
        </p>
        <p className="text-slate-300 text-sm">
          You can decline analytics and continue using basic features (subject to rate limits/security). You
          may request account deletion at any time.
        </p>
      </div>
    </main>
  );
}
