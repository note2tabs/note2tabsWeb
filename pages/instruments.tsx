import Link from "../components/LocaleLink";
import SeoHead, { absoluteUrl } from "../components/SeoHead";

export const instruments = [
  { name: "Piano", description: "Turn recordings into notes, write a piano score and inspect the same part in a piano roll.", transcribe: "/piano-transcription", editor: "/piano-sheet-music-editor" },
  { name: "Guitar", description: "Generate guitar tabs from audio, choose playable fingerings and arrange the song.", transcribe: "/audio-to-guitar-tab-converter", editor: "/editor" },
  { name: "Bass", description: "Transcribe a bassline or write a groove on a four-string E–A–D–G staff.", transcribe: "/audio-to-bass-tabs", editor: "/bass-tab-editor" },
  { name: "Drums", description: "Work out a recorded groove or write kick, snare, tom and cymbal parts together.", transcribe: "/drum-transcription", editor: "/drum-notation-editor" },
  { name: "Ukulele", description: "Review notes from a recording and arrange a four-string part in high-G or low-G tuning.", transcribe: "/ukulele-transcription", editor: "/ukulele-tab-editor" },
];
export default function InstrumentsPage() {
  return <>
    <SeoHead title="Piano, Guitar, Bass, Drums & Ukulele Tools | Note2Tabs" description="Choose your instrument. Transcribe a recording or start writing in an online piano, guitar, bass, drum or ukulele editor." canonicalPath="/instruments" hasTranslation={false} contentLocale="en" jsonLd={{
      "@context": "https://schema.org", "@type": "ItemList", name: "Note2Tabs instrument tools",
      itemListElement: instruments.map((instrument, index) => ({ "@type": "ListItem", position: index + 1, name: instrument.name, url: absoluteUrl(instrument.transcribe) })),
    }} />
    <main className="instrument-hub container">
      <header><p className="search-landing-kicker">Note2Tabs / Instruments</p><h1>What do you play?</h1><p>Start with a recording, or write the part yourself.</p></header>
      <div className="instrument-hub-list">{instruments.map(instrument => <section key={instrument.name}>
        <h2>{instrument.name}</h2><p>{instrument.description}</p>
        <nav aria-label={`${instrument.name} tools`}><Link href={instrument.transcribe}>Transcribe {instrument.name.toLowerCase()} <span aria-hidden="true">→</span></Link><Link href={instrument.editor}>Open editor <span aria-hidden="true">↗</span></Link></nav>
      </section>)}</div>
    </main>
  </>;
}
