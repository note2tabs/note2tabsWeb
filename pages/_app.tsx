import type { AppProps } from "next/app";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { SessionProvider } from "next-auth/react";
import NavBar from "../components/NavBar";
import FooterBar from "../components/FooterBar";
import CookieConsentBanner from "../components/CookieConsentBanner";
import AnalyticsIdentityLinker from "../components/AnalyticsIdentityLinker";
import { sendEvent } from "../lib/analytics";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    const trackPageView = (url?: string) => {
      const rawPath = url ?? window.location.pathname;
      const path = rawPath.split("?")[0]?.split("#")[0] || "/";
      sendEvent("page_view", { path });
    };

    trackPageView();
    router.events.on("routeChangeComplete", trackPageView);
    return () => {
      router.events.off("routeChangeComplete", trackPageView);
    };
  }, [router.events]);

  return (
    <SessionProvider session={session}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="app-shell">
        <NavBar />
        <main className="flex-1">
          <Component {...pageProps} />
        </main>
        <FooterBar />
        <CookieConsentBanner />
        <AnalyticsIdentityLinker />
      </div>
    </SessionProvider>
  );
}
