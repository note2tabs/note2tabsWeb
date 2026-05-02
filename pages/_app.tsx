import type { AppProps } from "next/app";
import dynamic from "next/dynamic";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { SessionProvider } from "next-auth/react";
import NavBar from "../components/NavBar";
import FooterBar from "../components/FooterBar";
import { ANALYTICS_EVENTS, sendEvent } from "../lib/analytics";
import "../styles/globals.css";

const CookieConsentBanner = dynamic(() => import("../components/CookieConsentBanner"), { ssr: false });
const AnalyticsIdentityLinker = dynamic(() => import("../components/AnalyticsIdentityLinker"), { ssr: false });

export default function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    const trackPageView = (url?: string) => {
      const rawPath = url ?? window.location.pathname;
      const path = rawPath.split("?")[0]?.split("#")[0] || "/";
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
    if (typeof window === "undefined") return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav) {
      sendEvent(ANALYTICS_EVENTS.webVital, {
        metric: "page_load",
        value: Math.round(nav.loadEventEnd || nav.domComplete || nav.duration),
        path: window.location.pathname,
      });
    }

    let largestContentfulPaint = 0;
    const observers: PerformanceObserver[] = [];
    const observe = (type: string, handler: (entry: PerformanceEntry) => void) => {
      if (!("PerformanceObserver" in window)) return;
      try {
        const observer = new PerformanceObserver((list) => list.getEntries().forEach(handler));
        observer.observe({ type, buffered: true });
        observers.push(observer);
      } catch {
        // Some browsers do not support all performance entry types.
      }
    };

    observe("largest-contentful-paint", (entry) => {
      largestContentfulPaint = Math.round(entry.startTime);
    });
    observe("layout-shift", (entry: any) => {
      if (!entry.hadRecentInput && typeof entry.value === "number") {
        sendEvent(ANALYTICS_EVENTS.webVital, {
          metric: "cls",
          value: Math.round(entry.value * 1000) / 1000,
          path: window.location.pathname,
        });
      }
    });

    const flushPerformance = () => {
      if (largestContentfulPaint > 0) {
        sendEvent(ANALYTICS_EVENTS.webVital, {
          metric: "lcp",
          value: largestContentfulPaint,
          path: window.location.pathname,
        });
      }
    };
    window.addEventListener("pagehide", flushPerformance);
    return () => {
      flushPerformance();
      window.removeEventListener("pagehide", flushPerformance);
      observers.forEach((observer) => observer.disconnect());
    };
  }, []);

  return (
    <SessionProvider session={session} refetchInterval={0} refetchOnWindowFocus={false}>
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
