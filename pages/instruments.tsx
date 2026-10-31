import { useLocale } from "../lib/i18n/react";
import { instrumentCatalogs } from "../lib/i18n/instruments";
import { localizedInstrumentGuideGroups, instrumentGuideHeading } from "../lib/i18n/instrumentGuides";
import { localeHref } from "../lib/i18n/locale";
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
  const {locale} = useLocale();
  const c = instrumentCatalogs[locale];
  return <>
    <SeoHead title={c ? `${c.hubMetaTitle} | Note2Tabs` : "Piano, Guitar, Bass, Drums & Ukulele Tools | Note2Tabs"} description={c?.hub[5] ?? "Choose your instrument. Transcribe a recording or start writing in an online piano, guitar, bass, drum or ukulele editor."} canonicalPath="/instruments" hasTranslation={true} contentLocale={locale} jsonLd={{
      "@context": "https://schema.org", "@type": "ItemList", name: c?.hub[4] ?? "Note2Tabs instrument tools",
      itemListElement: instruments.map((instrument, index) => ({ "@type": "ListItem", position: index + 1, name: c?.names[index] ?? instrument.name, url: absoluteUrl(localeHref(instrument.transcribe, locale)) })),
    }} />
    <main className="instrument-hub container">
      <header><p className="search-landing-kicker">Note2Tabs / {c?.hub[3] ?? "Instruments"}</p><h1>{c?.hub[0] ?? "What do you play?"}</h1><p>{c?.hub[1] ?? "Start with a recording, or write the part yourself."}</p></header>
      <div className="instrument-hub-list">{instruments.map((instrument,index) => <section key={instrument.name}>
        <h2>{c?.names[index] ?? instrument.name}</h2><p>{c ? (index === 0 ? c.descriptions[0] : index === 3 ? c.descriptions[2] : index === 4 ? c.descriptions[5] : c.hub[index === 1 ? 6 : 7]) : instrument.description}</p>
        <nav aria-label={c ? `${c.names[index]} — ${c.hub[3]}` : `${instrument.name} tools`}><Link href={instrument.transcribe}>{c ? (index===0 ? c.actions[0] : index===3 ? c.actions[2] : index===4 ? c.actions[5] : c.hub[index===1 ? 8 : 9]) : `Transcribe ${instrument.name.toLowerCase()}`} <span aria-hidden="true">→</span></Link><Link href={instrument.editor}>{c?.hub[2] ?? "Open editor"} <span aria-hidden="true">↗</span></Link></nav>
        {localizedInstrumentGuideGroups(locale).find(group => group.instrument === instrument.name.toLowerCase()) && <details className="instrument-directory-guides">
          <summary>{instrumentGuideHeading(locale, instrument.name.toLowerCase())}</summary>
          <ul>{localizedInstrumentGuideGroups(locale).find(group => group.instrument === instrument.name.toLowerCase())!.guides.map(guide => <li key={guide.slug}><Link href={`/blog/${guide.slug}`}>{guide.title}</Link></li>)}</ul>
        </details>}
      </section>)}</div>
    </main>
  </>;
}
