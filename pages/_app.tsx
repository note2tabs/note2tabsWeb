import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { SessionProvider } from "next-auth/react";
import NavBar from "../components/NavBar";
import FooterBar from "../components/FooterBar";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";
import { sanitizeAnalyticsPathname } from "../lib/analyticsPrivacy";
import "../styles/globals.css";

const AnalyticsIdentityLinker = dynamic(() => import("../components/AnalyticsIdentityLinker"), { ssr: false });

export default function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();
  const isGteEditorPage = router.pathname === "/gte/[editor_id]";

  useEffect(() => {
    const trackPageView = (url?: string) => {
      const rawPath = url ?? window.location.pathname;
      const path = sanitizeAnalyticsPathname(rawPath);
      sendEvent(ANALYTICS_EVENTS.pageView, {
        path,
        title: document.title,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
    };

    trackPageView();
    router.events.on("routeChangeComplete", trackPageView);
    return () => {
      router.events.off("routeChangeComplete", trackPageView);
    };
  }, [router.events]);

  return (
    <SessionProvider session={session} refetchInterval={0} refetchOnWindowFocus={false}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <NavBar editorRevealMode={isGteEditorPage} />
        <div id="main-content" className="flex-1" tabIndex={-1}>
          <Component {...pageProps} />
        </div>
        {!isGteEditorPage && <FooterBar />}
        <AnalyticsIdentityLinker />
      </div>
    </SessionProvider>
  );
}
