import type { AppProps } from "next/app";
import Head from "next/head";
import { SessionProvider } from "next-auth/react";
import NavBar from "../components/NavBar";
import FooterBar from "../components/FooterBar";
import CookieConsentBanner from "../components/CookieConsentBanner";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
      <Head>
        <title>Note2Tabs</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
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
