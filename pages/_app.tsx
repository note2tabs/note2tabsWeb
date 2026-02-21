import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { SessionProvider } from "next-auth/react";
import NavBar from "../components/NavBar";
import FooterBar from "../components/FooterBar";
import CookieConsentBanner from "../components/CookieConsentBanner";
import "../styles/globals.css";
import "katex/dist/katex.min.css";

export default function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();
  const siteTitle = "Note2Tabs | Convert audio to guitar tabs online";
  const siteDescription =
    "Upload audio or a YouTube link and instantly get playable guitar tabs. Edit, simplify and practice songs directly in the browser.";
  const rawBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  const baseUrl = rawBaseUrl.endsWith("/") ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
  const canonicalPath = router.asPath.split("?")[0].split("#")[0];
  const canonicalUrl = `${baseUrl}${canonicalPath}`;

  return (
    <SessionProvider session={session}>
      <Head>
        <title>{siteTitle}</title>
        <meta name="description" content={siteDescription} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:title" content={siteTitle} />
        <meta property="og:description" content={siteDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="Note2Tabs" />
        <meta property="og:image" content={`${baseUrl}/logo01black.png`} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={siteTitle} />
        <meta name="twitter:description" content={siteDescription} />
        <meta name="twitter:image" content={`${baseUrl}/logo01black.png`} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/sf-pro-display" />
        <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/sf-pro-text" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap"
        />
      </Head>
      <div className="app-shell">
        <NavBar />
        <main className="flex-1">
          <Component {...pageProps} />
        </main>
        <FooterBar />
        <CookieConsentBanner />
      </div>
    </SessionProvider>
  );
}
