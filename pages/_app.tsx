import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { SessionProvider } from "next-auth/react";
import NavBar from "../components/NavBar";
import FooterBar from "../components/FooterBar";
import SessionAccountRefresher from "../components/SessionAccountRefresher";
import RouteLoadingIndicator from "../components/RouteLoadingIndicator";
import PremiumUpgradePrompt from "../components/PremiumUpgradePrompt";
import UserActivityTracker from "../components/UserActivityTracker";
import AffiliateAttributionCapture from "../components/AffiliateAttributionCapture";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";
import { sanitizeAnalyticsPathname } from "../lib/analyticsPrivacy";
import {
  sessionReplayIsBlocked,
  stopPostHogSessionRecording,
  syncPostHogSessionRecording,
} from "../lib/posthogClient";
import "../styles/globals.css";

const AnalyticsIdentityLinker = dynamic(() => import("../components/AnalyticsIdentityLinker"), { ssr: false });

export default function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();
  const isGteEditorPage = router.pathname === "/gte/[editor_id]";
  const isProductHomePage = router.pathname === "/home";

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

  useEffect(() => {
    const stopBeforeSensitiveRoute = (url: string) => {
      if (sessionReplayIsBlocked(url)) stopPostHogSessionRecording();
    };
    const syncAfterNavigation = (url: string) => {
      void syncPostHogSessionRecording(url);
    };
    const syncAfterConsentChange = () => {
      void syncPostHogSessionRecording(window.location.pathname + window.location.search);
    };

    void syncPostHogSessionRecording(window.location.pathname + window.location.search);
    router.events.on("routeChangeStart", stopBeforeSensitiveRoute);
    router.events.on("routeChangeComplete", syncAfterNavigation);
    window.addEventListener("note2tabs:analytics-consent-changed", syncAfterConsentChange);
    return () => {
      router.events.off("routeChangeStart", stopBeforeSensitiveRoute);
      router.events.off("routeChangeComplete", syncAfterNavigation);
      window.removeEventListener("note2tabs:analytics-consent-changed", syncAfterConsentChange);
    };
  }, [router.events]);

  return (
    <SessionProvider session={session} refetchInterval={0} refetchOnWindowFocus={false}>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="app-shell">
        <RouteLoadingIndicator />
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <NavBar editorRevealMode={isGteEditorPage} />
        <div
          id="main-content"
          className="flex-1"
          tabIndex={-1}
          data-ph-no-capture={sessionReplayIsBlocked(router.asPath) ? "" : undefined}
        >
          <Component {...pageProps} />
        </div>
        {!isGteEditorPage && !isProductHomePage && <FooterBar />}
        <SessionAccountRefresher />
        <UserActivityTracker />
        <AnalyticsIdentityLinker />
        <PremiumUpgradePrompt />
        <AffiliateAttributionCapture />
      </div>
    </SessionProvider>
  );
}
