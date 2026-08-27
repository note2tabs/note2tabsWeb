import SeoHead from "../components/SeoHead";

export default function PrivacyPage() {
  return (
    <>
      <SeoHead
        title="Privacy Policy | Note2Tabs"
        description="Learn how Note2Tabs handles account data, audio, tablature, analytics, advertising, cookies and your privacy choices."
        canonicalPath="/privacy"
      />
      <main className="page legal-page">
        <div className="legal-shell">
          <header className="legal-header">
            <p className="legal-kicker">Privacy</p>
            <h1 className="page-title">Privacy Policy</h1>
            <p className="page-subtitle">Last updated: August 26, 2026</p>
          </header>

          <section className="legal-prose">
            <p>
              This notice explains how Note2Tabs collects and uses personal data when you visit note2tabs.com, create
              an account, transcribe audio, edit tablature, subscribe, or choose to receive advertising. Note2Tabs is
              operated from Sweden and acts as the controller for the processing described here. Contact us at{" "}
              <a href="mailto:support@note2tabs.com">support@note2tabs.com</a> or, for legal requests, at{" "}
              <a href="mailto:legal@note2tabs.com">legal@note2tabs.com</a>.
            </p>

            <h2>Information we collect</h2>
            <ul>
              <li>Account information, such as your email address, name, account role and verification state.</li>
              <li>Audio, YouTube references, transcription settings, generated MIDI or tabs, saved projects and edits.</li>
              <li>Subscription and transaction status. Payment-card details are handled by Stripe, not Note2Tabs.</li>
              <li>Support messages and information you choose to provide.</li>
              <li>Security and operational data, including IP address, timestamps, request information and errors.</li>
              <li>With analytics permission: product activity, referrals, device details, approximate location and permitted replay.</li>
              <li>With advertising permission: device data, identifiers, location, ad requests, bids, impressions and clicks.</li>
            </ul>

            <h2>Why we use information</h2>
            <ul>
              <li>To provide accounts, transcription, editing, storage, exports and customer support.</li>
              <li>To process subscriptions, enforce usage limits and keep payment status accurate.</li>
              <li>To secure the service, prevent fraud and abuse, diagnose failures and comply with law.</li>
              <li>With permission, to understand product usage and improve Note2Tabs.</li>
              <li>With permission, to select, deliver, measure and personalize advertising.</li>
            </ul>

            <h2>Legal bases</h2>
            <p>
              We process data when necessary to perform our contract with you, comply with legal obligations, and
              pursue legitimate interests such as service security, fraud prevention and reliable operation. We use
              consent for non-essential analytics, session replay, advertising storage and personalization. You can
              withdraw consent at any time without affecting earlier lawful processing.
            </p>

            <h2>Cookies and privacy choices</h2>
            <p>
              Essential cookies support sign-in, security and requested features. A consent cookie remembers your
              choices. Optional analytics and advertising technologies remain off until you grant the relevant
              permission. Rejecting them does not prevent access to core Note2Tabs features.
            </p>
            <p>
              Use{" "}
              <button type="button" className="legal-inline-button" onClick={() => window.dispatchEvent(new CustomEvent("note2tabs:open-consent"))}>
                Privacy choices
              </button>{" "}
              to accept, reject or withdraw optional permissions. Browser controls may also delete or block cookies,
              although blocking essential cookies can affect sign-in and saved preferences.
            </p>

            <h2>Analytics and session replay</h2>
            <p>
              If you consent, we use PostHog to measure product use. PostHog may receive product events, permitted
              identifiers, device/browser information, approximate location and account ID after sign-in. Optional
              editor replay can include visible editor content, project names, notes, chords, fingerings, pointer
              activity and canvas rendering. Passwords, payment pages, authentication, settings, administration,
              uploads, network bodies and sensitive headers are excluded or masked.
            </p>

            <h2>Advertising</h2>
            <p>
              If you consent, Note2Tabs may use Newor Media, Google and demand partners disclosed through our consent
              platform to run programmatic advertising. These companies may use cookies, pixels, web beacons, IP
              addresses, device identifiers and similar technologies to request bids, prevent fraud, limit frequency,
              measure performance, build or use audience segments, and show contextual or personalized ads.
            </p>
            <p>
              Current partner details and purpose-level controls will be presented in the advertising consent panel.
              See the <a href="https://newormedia.com/privacy-policy" target="_blank" rel="noreferrer">Newor Media privacy policy</a>,{" "}
              <a href="https://business.safety.google/privacy/" target="_blank" rel="noreferrer">Google&apos;s business data information</a>,{" "}
              <a href="https://optout.aboutads.info/" target="_blank" rel="noreferrer">Digital Advertising Alliance</a>, and{" "}
              <a href="https://www.youronlinechoices.com/" target="_blank" rel="noreferrer">Your Online Choices</a>.
            </p>

            <h2>Who receives information</h2>
            <p>
              We disclose information to providers supporting hosting, cloud storage, transcription, databases,
              authentication, email, payments, analytics, security and, when permitted, advertising. Current providers
              include Google Cloud, Vercel, Neon, Stripe, PostHog and Newor Media and its disclosed demand partners. We
              may also disclose information when legally required or as part of a corporate transaction with safeguards.
              We do not sell uploaded audio or tablature.
            </p>

            <h2>International transfers</h2>
            <p>
              Providers may process information outside Sweden or the European Economic Area. Where required, we rely
              on adequacy decisions, the European Commission&apos;s Standard Contractual Clauses, or another lawful transfer
              mechanism, together with appropriate safeguards.
            </p>

            <h2>Retention</h2>
            <p>
              Account information and saved tabs are generally retained while your account is active and removed or
              anonymized after deletion, subject to backups, fraud prevention and legal obligations. Uploaded audio,
              intermediate stems, predictions and processing artifacts are retained only as long as needed to process,
              troubleshoot and secure the service, then removed under storage lifecycle rules. Payment records,
              consent records, support correspondence and security logs are retained as reasonably needed for
              accounting, disputes, abuse prevention and legal compliance.
            </p>

            <h2>Your rights</h2>
            <p>
              Depending on where you live, you may request access, correction, deletion, portability, restriction or
              objection; withdraw consent; or appeal a privacy decision. You may also have rights to opt out of sale,
              sharing or targeted advertising. Contact <a href="mailto:legal@note2tabs.com">legal@note2tabs.com</a>.
              We may verify your identity. You may complain to your local authority; in Sweden, this is the{" "}
              <a href="https://www.imy.se/en/" target="_blank" rel="noreferrer">Swedish Authority for Privacy Protection (IMY)</a>.
            </p>

            <h2>Children</h2>
            <p>
              Note2Tabs is not directed to children under 13, and we do not knowingly collect their personal data.
              Additional age restrictions may apply locally. We do not knowingly use personalized advertising where
              age-based advertising restrictions apply.
            </p>

            <h2>Security and changes</h2>
            <p>
              We use technical and organizational safeguards designed to protect information, but no service can
              guarantee absolute security. We may update this notice when practices or legal obligations change. We
              will update the date above and provide additional notice when a material change requires it.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
