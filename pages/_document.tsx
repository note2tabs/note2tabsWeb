import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .hero{position:relative;overflow:hidden}
              .hero--landing-funnel{min-height:calc(100svh - 56px);padding:20px 0 28px;background:#fbf8f1;isolation:isolate;overflow-anchor:none}
              .hero--landing-funnel .hero-stack{position:relative;z-index:1;min-height:calc(100svh - 104px);align-content:center}
              .hero-doodle-field{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden}
              .hero-doodle{position:absolute;display:block;width:var(--doodle-width);max-width:none;height:auto;opacity:0;transform:translate3d(var(--doodle-x,0),var(--doodle-y,0),0) rotate(var(--doodle-rotate,0deg));transform-origin:center;user-select:none;animation:hero-doodle-fade .8s ease .12s both}
              .hero-doodle--guitar{--doodle-opacity:.2;--doodle-width:clamp(220px,25vw,380px);--doodle-rotate:-13deg;--doodle-y:-8px;top:15%;left:max(14px,calc((100vw - var(--max-width,1160px))/2 - 112px))}
              .hero-doodle--notes{--doodle-opacity:.17;--doodle-width:clamp(260px,29vw,440px);--doodle-rotate:3deg;--doodle-y:18px;top:8%;right:max(8px,calc((100vw - var(--max-width,1160px))/2 - 126px))}
              .hero-doodle--fretboard{--doodle-opacity:.13;--doodle-width:clamp(330px,34vw,520px);--doodle-rotate:-17deg;--doodle-y:10px;bottom:7%;left:max(-28px,calc((100vw - var(--max-width,1160px))/2 - 156px))}
              .hero-doodle--picks{--doodle-opacity:.12;--doodle-width:clamp(145px,14vw,220px);--doodle-rotate:14deg;--doodle-x:12px;right:max(92px,calc((100vw - var(--max-width,1160px))/2 + 136px));top:66%}
              @keyframes hero-doodle-fade{from{opacity:0}to{opacity:var(--doodle-opacity,.2)}}
              .prompt-shell--funnel{width:min(100%,760px);border-radius:24px;padding:14px;margin-top:22px;text-align:left;border:1px solid rgba(255,255,255,.75);background:rgba(247,248,241,.9);box-shadow:0 22px 52px rgba(15,23,42,.12)}
              .page-home .prompt-shell--funnel{border:1px solid rgba(6,17,13,.13);background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(251,253,249,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 34px 80px rgba(6,17,13,.18),0 12px 26px rgba(6,17,13,.09);backdrop-filter:blur(14px)}
              .prompt-meta-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:20px;line-height:1.25;margin-bottom:8px}
              .prompt-meta-row.is-empty{visibility:hidden}
              .hero-credits-inline{min-width:0;margin:0;font-size:.85rem;color:#5a6b83;text-align:right;white-space:nowrap}
              .funnel-panel{display:grid;gap:12px}
              .funnel-row{display:block;margin-top:0}
              .funnel-input{position:relative;min-height:112px;border-radius:20px;padding:16px;display:flex;align-items:flex-start;gap:12px;border:1px solid rgba(6,17,13,.11);background:linear-gradient(180deg,rgba(252,253,249,.98),rgba(246,248,243,.92));box-shadow:inset 0 1px 0 rgba(255,255,255,.95),inset 0 -1px 0 rgba(6,17,13,.035);cursor:text}
              .funnel-icon{width:26px;height:26px;flex-shrink:0;margin-top:0;border-radius:999px;color:#111;background:linear-gradient(180deg,rgba(255,255,255,.96),rgba(244,241,234,.78));border:1px solid rgba(6,17,13,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.85);display:grid;place-items:center}
              .funnel-icon--youtube{background:transparent;border:0;box-shadow:none}
              .funnel-file-label{font-size:1.05rem;color:#334155;font-weight:400}
              .funnel-input input{width:100%;border:none;outline:none;background:transparent;font-size:1.05rem;color:#1e293b}
              .funnel-external-label{font-size:.75rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#64748b;padding-left:2px}
              .mode-switch{display:inline-flex;gap:6px;padding:4px;margin-top:22px;background:rgba(255,255,255,.72);border:1px solid rgba(6,17,13,.09);border-radius:999px;box-shadow:inset 0 1px 0 rgba(255,255,255,.78),0 8px 18px rgba(6,17,13,.04)}
              .mode-switch--hero{margin-top:0}
              .mode-switch button{border:none;background:transparent;padding:7px 14px;border-radius:999px;font-weight:600;color:#415065}
              .mode-switch button.active{background:#111;color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 8px 18px rgba(17,17,17,.13)}
              .funnel-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}
              .funnel-submit{position:relative;overflow:hidden;border-radius:999px;min-height:42px;padding:0 18px;font-size:.9rem;font-weight:700;letter-spacing:.01em;white-space:nowrap;background:#111;border-color:rgba(17,17,17,.16);box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 10px 24px rgba(17,17,17,.14)}
              @media (min-width:960px){
                .hero--landing-funnel{min-height:calc(100dvh - 64px);padding:34px 0 40px}
                .hero--landing-funnel .hero-stack{min-height:calc(100dvh - 138px)}
                .hero--landing-funnel .hero-heading{margin-top:-18px}
              }
              @media (max-width:860px){
                .hero--landing-funnel{min-height:calc(100svh - 56px);padding:20px 0 28px}
                .hero--landing-funnel .hero-stack{min-height:calc(100svh - 104px);gap:16px;align-content:center}
                .hero-doodle{--doodle-opacity:.13}
                .hero-doodle--guitar{--doodle-width:clamp(180px,42vw,270px);top:12%;left:-72px}
                .hero-doodle--notes{--doodle-width:clamp(210px,48vw,320px);top:7%;right:-112px}
                .hero-doodle--fretboard,.hero-doodle--picks{display:none}
                .prompt-shell--funnel{border-radius:18px;padding:12px;margin-top:8px;box-shadow:0 8px 22px rgba(6,17,13,.12)}
                .page-home .prompt-shell--funnel{box-shadow:0 8px 22px rgba(6,17,13,.12)}
                .funnel-toolbar{flex-direction:column;align-items:stretch}
                .funnel-input{min-height:86px;border-radius:16px;padding:14px}
                .funnel-submit{width:100%;min-height:56px}
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
