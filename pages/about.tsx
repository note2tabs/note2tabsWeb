export default function AboutPage() {
  return (
    <main className="page about-page">
      <div className="about-shell">
        <header className="about-header">
          <p className="legal-kicker">Note2Tabs</p>
          <h1 className="page-title"><strong>About Us</strong></h1>
        </header>

        <section className="about-section">
          <h2 className="about-section-label">What Is Note2Tabs</h2>
          <div className="about-section-content">
            <p className="about-hero-text">
              Note2Tabs is the complete platform to transcribe, edit tabs and create guitar music.
            </p>
            <div className="about-detail-grid">
              <article className="about-detail-card">
                <h3>Transcriber</h3>
                <p>Generate guitar tabs from any piece of music, with incredible accuracy. Our goal is to provide everyone with perfect transcriptions everytime.</p>
              </article>
              <article className="about-detail-card">
                <h3>Tab Editor</h3>
                <p>Our guitar tab editor lets you edit tabs, optimize fingerings and create guitar music without having to constantly think about music-theory.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="about-section">
          <h2 className="about-section-label">Who We Are</h2>
          <div className="about-section-content">
            <p className="about-hero-text">
              Meet the team:
            </p>
            <div className="about-team-grid">
              <article className="about-person">
                <div className="about-photo about-photo--one" aria-hidden="true">
                  <span>Stand-in photo 1</span>
                </div>
                <h3>Noel Solomon</h3>
                <p>Hobby Producer & Engineering Student</p>
              </article>
              <article className="about-person">
                <div className="about-photo about-photo--two" aria-hidden="true">
                  <span>Stand-in photo 2</span>
                </div>
                <h3>Aron Salamon</h3>
                <p>Hobby Guitarist & Engineering Student</p>
              </article>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
