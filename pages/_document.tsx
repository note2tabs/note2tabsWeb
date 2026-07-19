import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .hero{position:relative;overflow:hidden}
              .page-home{padding-top:0}
              .hero.hero--landing-funnel{min-height:calc(100svh - 56px);padding:20px 0 28px;background:#fbf8f1;isolation:isolate;overflow-anchor:none}
              .hero--landing-funnel .hero-stack{position:relative;z-index:1;min-height:calc(100svh - 104px);align-content:center}
              .hero-stack--centered{justify-items:center;text-align:center}
              .hero-heading{max-width:980px;text-align:center}
              .hero-title-row{display:inline-flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}
              .hero-eyebrow{margin:0 0 12px;color:rgba(6,17,13,.62);font-size:.78rem;font-weight:500;letter-spacing:.12em;text-transform:uppercase}
              .hero--landing-funnel .hero-title{margin:0;max-width:980px;color:#06110d;font-size:clamp(1.9rem,4.4vw,3.5rem);font-weight:400;line-height:1.02;letter-spacing:-.04em}
              .hero--landing-funnel .hero-subtitle{max-width:740px;margin:14px auto 0;color:rgba(6,17,13,.72);font-size:clamp(.96rem,1.35vw,1.12rem);font-weight:400;line-height:1.5;letter-spacing:-.008em}
              .hero-doodle-field{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
              .hero-doodle{position:absolute;display:block;width:var(--doodle-width);max-width:none;height:auto;opacity:var(--doodle-opacity,.2);transform:translate3d(var(--doodle-x,0),var(--doodle-y,0),0) rotate(var(--doodle-rotate,0deg));transform-origin:center;background-position:center;background-repeat:no-repeat;background-size:contain;user-select:none}
              .hero-doodle--guitar{aspect-ratio:644/472;--doodle-opacity:.2;--doodle-width:clamp(220px,25vw,380px);--doodle-rotate:-13deg;--doodle-y:-8px;background-image:url('/images/doodles/hand-drawn-guitar.webp');top:15%;left:max(14px,calc((100vw - var(--max-width,1160px))/2 - 112px))}
              .hero-doodle--notes{aspect-ratio:1095/759;--doodle-opacity:.17;--doodle-width:clamp(260px,29vw,440px);--doodle-rotate:3deg;--doodle-y:18px;background-image:url('/images/doodles/music-notes.webp');top:8%;right:max(8px,calc((100vw - var(--max-width,1160px))/2 - 126px))}
              .hero-doodle--fretboard{aspect-ratio:1601/690;--doodle-opacity:.13;--doodle-width:clamp(330px,34vw,520px);--doodle-rotate:-17deg;--doodle-y:10px;background-image:url('/images/doodles/fretboard-segment.webp');bottom:7%;left:max(-28px,calc((100vw - var(--max-width,1160px))/2 - 156px))}
              .hero-doodle--picks{aspect-ratio:920/739;--doodle-opacity:.12;--doodle-width:clamp(145px,14vw,220px);--doodle-rotate:14deg;--doodle-x:12px;background-image:url('/images/doodles/alternatives/guitar-picks.webp');right:max(92px,calc((100vw - var(--max-width,1160px))/2 + 136px));top:66%}
              .prompt-shell--funnel{width:min(100%,760px);border-radius:24px;padding:14px;margin-top:22px;text-align:left;border:1px solid rgba(255,255,255,.75);background:rgba(247,248,241,.9);box-shadow:0 22px 52px rgba(15,23,42,.12)}
              .page-home .prompt-shell--funnel{border:1px solid rgba(6,17,13,.13);background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(251,253,249,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 34px 80px rgba(6,17,13,.18),0 12px 26px rgba(6,17,13,.09);backdrop-filter:blur(14px)}
              .prompt-meta-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:20px;line-height:1.25;margin-bottom:8px}
              .prompt-meta-left{display:inline-flex;align-items:center;gap:10px;min-width:0}
              .prompt-meta-row.is-empty{visibility:hidden}
              .hero-credits-inline{min-width:0;margin:0;font-size:.85rem;color:#5a6b83;text-align:right;white-space:nowrap}
              .model-choice--meta{width:168px;flex:0 0 auto;margin:0}
              .model-dropdown{position:relative;width:100%}
              .model-dropdown-menu{position:absolute;z-index:30;top:calc(100% + 6px);left:0;right:0;display:none;gap:2px;padding:5px}
              .model-dropdown[open] .model-dropdown-menu{display:grid}
              .model-dropdown-option-copy{display:grid;gap:2px;min-width:0}
              .model-dropdown-option-title{display:block;font-size:.76rem;line-height:1.25}
              .model-dropdown-option-description{display:block;font-size:.68rem;line-height:1.35}
              .funnel-panel{display:grid;gap:12px}
              .funnel-row{display:block;margin-top:0}
              .funnel-input{position:relative;min-height:112px;border-radius:20px;padding:16px;display:flex;align-items:flex-start;gap:12px;border:1px solid rgba(6,17,13,.11);background:linear-gradient(180deg,rgba(252,253,249,.98),rgba(246,248,243,.92));box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 rgba(6,17,13,.035);cursor:text}
              .native-file-input{position:absolute;inset:0;z-index:2;width:100%;height:100%;cursor:pointer;opacity:0}
              .funnel-icon{width:26px;height:26px;flex-shrink:0;margin-top:0;border-radius:999px;color:#111;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(244,241,234,.78));border:1px solid rgba(6,17,13,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.85);display:grid;place-items:center}
              .funnel-icon--youtube{background:transparent;border:0;box-shadow:none}
              .funnel-file-label{font-size:1.05rem;color:#334155;font-weight:400}
              .funnel-input input{width:100%;border:none;outline:none;background:transparent;font-size:1.05rem;color:#1e293b}
              .funnel-input:focus-within{outline:3px solid rgba(37,99,235,.3);outline-offset:2px}
              .funnel-external-label{font-size:.75rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#64748b;padding-left:2px}
              .mode-switch{display:inline-flex;gap:6px;padding:4px;margin-top:22px;background:rgba(255,255,255,.72);border:1px solid rgba(6,17,13,.09);border-radius:999px;box-shadow:inset 0 1px 0 rgba(255,255,255,.78),0 8px 18px rgba(6,17,13,.04)}
              .mode-switch--hero{margin-top:0}
              .mode-switch button{border:none;background:transparent;padding:7px 14px;border-radius:999px;font-weight:600;color:#415065}
              .mode-switch button.active{background:#111;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 8px 18px rgba(17,17,17,.13)}
              .funnel-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}
              .funnel-submit{position:relative;overflow:hidden;border-radius:999px;min-height:42px;padding:0 18px;font-size:.9rem;font-weight:700;letter-spacing:.01em;white-space:nowrap;background:#111;border-color:rgba(17,17,17,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 10px 24px rgba(17,17,17,.14)}
              .button-primary.funnel-submit{padding:0 18px}
              .hero-outcome-row{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:2px;color:rgba(6,17,13,.64);font-size:.8rem}
              .hero-outcome-row span{display:inline-flex;align-items:center;gap:8px;min-height:28px;padding:0 10px;border-radius:999px;border:1px solid rgba(6,17,13,.09);background:rgba(255,255,255,.48);white-space:nowrap}
              .hero-outcome-row span::before{content:"";width:5px;height:5px;border-radius:999px;background:rgba(6,17,13,.42)}
              @media (min-width:960px){
                .hero.hero--landing-funnel{min-height:calc(100dvh - 64px);padding:34px 0 40px}
                .hero--landing-funnel .hero-stack{min-height:calc(100dvh - 138px)}
                .hero--landing-funnel .hero-heading{margin-top:-18px}
              }
              @media (max-width:860px){
                .hero-doodle-field{display:none}
                .hero.hero--landing-funnel{min-height:calc(100svh - 56px);padding:20px 0 28px}
                .hero--landing-funnel .hero-stack{min-height:calc(100svh - 104px);gap:16px;align-content:center}
                .hero-eyebrow{margin-bottom:8px;font-size:.68rem}
                .hero-subtitle--conversion{max-width:320px;margin-top:10px;font-size:.9rem;line-height:1.42}
                .hero-outcome-row{max-width:330px;gap:7px 12px;font-size:.72rem}
                .hero--landing-funnel .hero-title{font-size:clamp(1.75rem,7.2vw,2.35rem);line-height:1.08}
                .hero-doodle{--doodle-opacity:.13}
                .hero-doodle--guitar{--doodle-width:clamp(180px,42vw,270px);top:12%;left:-72px}
                .hero-doodle--notes{--doodle-width:clamp(210px,48vw,320px);top:7%;right:-112px}
                .hero-doodle--fretboard,.hero-doodle--picks{display:none}
                .prompt-shell--funnel{border-radius:18px;padding:12px;margin-top:8px;box-shadow:0 8px 22px rgba(6,17,13,.12)}
                .page-home .prompt-shell--funnel{box-shadow:0 8px 22px rgba(6,17,13,.12)}
                .funnel-toolbar{flex-direction:column;align-items:stretch}
                .funnel-input{min-height:86px;border-radius:16px;padding:14px}
                .funnel-submit{width:100%;min-height:56px;font-size:1rem}
              }
              @media (max-width:720px){
                .editor-landing-hero{min-height:calc(100svh - 56px);padding-top:34px;padding-bottom:40px;overflow:hidden;background:#f6faf8}
                .editor-landing-shell{position:relative;min-height:calc(100svh - 130px);display:grid;align-items:center}
                .hero-heading{text-align:center;max-width:980px}
                .hero-title-row{display:inline-flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}
                .hero-title{margin:0;font-size:clamp(2.4rem,5.4vw,4.2rem)}
                .editor-landing-subtitle{max-width:590px;margin-top:16px;line-height:1.5}
                .editor-landing-hero-actions{display:flex;justify-content:center;align-items:center;flex-wrap:wrap;gap:12px;margin-top:22px}
              }
            `,
          }}
        />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#ffffff" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
