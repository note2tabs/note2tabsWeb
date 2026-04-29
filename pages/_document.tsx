import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .hero--landing-funnel{min-height:calc(100svh - 56px);padding:20px 0 28px}
              .hero--landing-funnel .hero-stack{min-height:calc(100svh - 104px);align-content:center}
              .prompt-shell--funnel{width:min(100%,760px);border-radius:24px;padding:14px;margin-top:22px;text-align:left;border:1px solid rgba(255,255,255,.75);background:rgba(247,248,241,.9);box-shadow:0 22px 52px rgba(15,23,42,.12)}
              .page-home .prompt-shell--funnel{border:1px solid rgba(6,17,13,.18);background:linear-gradient(180deg,rgba(255,255,255,.98),rgba(252,255,253,.96));box-shadow:0 30px 64px rgba(6,17,13,.22),0 10px 24px rgba(6,17,13,.12)}
              .prompt-meta-row{min-height:20px;margin-bottom:8px}
              .funnel-panel{display:grid;gap:12px}
              .funnel-row{display:block;margin-top:0}
              .funnel-input{position:relative;min-height:112px;border-radius:20px;padding:16px;display:flex;align-items:flex-start;gap:12px;border:1px solid rgba(15,23,42,.1);background:rgba(249,249,245,.94)}
              .funnel-icon{width:26px;height:26px;flex-shrink:0;margin-top:2px}
              .mode-switch{display:inline-flex;gap:6px;padding:4px;margin-top:22px}
              .mode-switch--hero{margin-top:0}
              .funnel-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}
              .funnel-submit{min-height:42px;padding:0 16px;white-space:nowrap}
              @media (min-width:960px){
                .hero--landing-funnel{min-height:calc(100dvh - 64px);padding:34px 0 40px}
                .hero--landing-funnel .hero-stack{min-height:calc(100dvh - 138px)}
              }
              @media (max-width:720px){
                .prompt-shell--funnel{border-radius:18px;padding:12px;margin-top:8px;box-shadow:0 8px 22px rgba(6,17,13,.12)}
                .page-home .prompt-shell--funnel{box-shadow:0 8px 22px rgba(6,17,13,.12)}
                .funnel-toolbar{flex-direction:column;align-items:stretch}
                .funnel-input{min-height:86px;border-radius:16px;padding:14px}
                .funnel-submit{width:100%;min-height:56px}
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
