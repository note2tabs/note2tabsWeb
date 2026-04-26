export default function AboutPage() {
  return (
    <main className="page about-page">
      <div className="about-shell">
        <header className="about-header">
          <p className="legal-kicker">Note2Tabs</p>
          <h1 className="page-title"><strong>About Us</strong></h1>
        </header>

        <section className="about-section about-section--story">
          <h2 className="about-section-label">Our Story</h2>
          <div className="about-section-content">
            <div className="about-story-copy">
              <p className="about-hero-text">
                How Note2Tabs started
              </p>
              <p className="about-story-paragraph">
                In 2024, while I was still new to guitar, I wanted to find the tabs for a cover of "Space Oddity" by David Bowie called "Space Oddity" by David Matthews. 
                I already knew how to play the MFDOOM sample of the song but I couldnt find any tabs for the original. 
                So I started searching for automatic transcriber option, but I couldnt find one that was good enough or practical to use.
                I then decided I was going to create my own transcriber and editor and with the help of my friend we finished our first analytic-transcriber in early 2025.
                While figuring out how to get the optimal fingerings, we had the idea for the guitar tab editor, which together with the transcriber became the base of Note2Tabs.
              </p>
              <p className="about-story-paragraph">
                In August 2025 both of us started studying engineering at KTH and on the side of our studies we started working on the website.
                We are still woring on this project every day, to make it the best transcriber and editor possible.
                Our goal is to make transcribing and creating your own guitar music as easy as possible,
                and we want to provide guitar players with the best tools imaginable to make the guitar playing experience actually about guitar.
              </p>
              <p className="about-story-paragraph">
                We are constantly working on new features, design fixes and tools that could improve the experience of the avrage guitarist. 
                If you have anything on your mind about what you would like to see from us, feedback or any ideas you might have, feel free to write to us! We'd love to hear from you.
              </p>
            </div>
          </div>
        </section>

        <section className="about-section">
          <h2 className="about-section-label">The Team</h2>
          <div className="about-section-content">
            <p className="about-hero-text">Meet the people behind Note2Tabs.</p>
            <div className="about-team-grid">
              <article className="about-person">
                <div className="about-photo about-photo--one" aria-hidden="true">
                  <img src="/images/team/noel.jpeg" alt="Noel Solomon" />
                </div>
                <h3>Noel Solomon</h3>
                <p>Hobby Producer & Engineering Student</p>
              </article>
              <article className="about-person">
                <div className="about-photo about-photo--two" aria-hidden="true">
                  <img src="/images/team/aron.jpeg" alt="Aron Salamon" />
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
