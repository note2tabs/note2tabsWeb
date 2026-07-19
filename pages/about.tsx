import Link from "next/link";
import SeoHead, { absoluteUrl } from "../components/SeoHead";

export default function AboutPage() {
  const description =
    "Learn how Note2Tabs started and why we build guitar transcription and tab editing tools for guitar players.";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "AboutPage",
      name: "About Note2Tabs",
      url: absoluteUrl("/about"),
      description,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "About",
          item: absoluteUrl("/about"),
        },
      ],
    },
  ];

  return (
    <>
      <SeoHead
        title="About Note2Tabs"
        description={description}
        canonicalPath="/about"
        jsonLd={jsonLd}
      />
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
                  In 2024, while I was still new to guitar, I wanted tabs for David Matthews' cover of David Bowie's "Space Oddity."
                  I already knew how to play the MF DOOM sample, but I couldn't find tabs for the original recording.
                  I searched for an automatic transcriber and couldn't find one that was both accurate enough and practical to use.
                  So, with the help of a friend, I built my own transcriber. We finished our first analytical version in early 2025.
                  While working out how to choose playable fingerings, we had the idea for the guitar tab editor. Together, the transcriber and editor became the foundation of Note2Tabs.
                </p>
                <p className="about-story-paragraph">
                  In August 2025, both of us started studying engineering at KTH and continued building the website alongside our studies.
                  We still work on the project every day to make the transcriber and editor as useful as possible.
                  Our goal is to make transcribing and creating your own guitar music as easy as possible,
                  and we want to provide guitar players with the best tools imaginable to make the guitar playing experience actually about guitar.
                </p>
                <p className="about-story-paragraph">
                  We are constantly working on new features, design improvements, and tools for everyday guitarists.
                  If there is something you would like to see, or you have feedback or an idea, please write to us.
                  <Link href="/feedback"> <strong>We'd love to hear from you.</strong></Link>
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
