import SeoHead from "../components/SeoHead";

export default function ContactPage() {
  return (
    <>
      <SeoHead
        title="Contact Note2Tabs"
        description="Contact Note2Tabs for product questions, feedback, bug reports, account issues, and support."
        canonicalPath="/contact"
      />
      <main className="page legal-page">
        <div className="legal-shell">
          <header className="legal-header">
            <p className="legal-kicker">Contact</p>
            <h1 className="page-title">Get in touch with Note2Tabs</h1>
            <p className="page-subtitle">
              Product questions, feedback, bug reports, or account issues. We read every message.
            </p>
          </header>

          <section className="legal-prose">
            <h2>Email</h2>
            <p>
              Reach us at <strong>note2tabs@gmail.com</strong>.
            </p>
            <p>
              Including your account email and a short description of the issue helps us respond faster.
            </p>

            <h2>Support scope</h2>
            <ul>
              <li>Billing and subscription questions</li>
              <li>Transcription workflow issues</li>
              <li>Editor and saved-tab problems</li>
              <li>General feedback and feature requests</li>
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
