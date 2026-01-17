import type { AppProps } from "next/app";
import Head from "next/head";
import { useEffect } from "react";
import { SessionProvider } from "next-auth/react";
import NavBar from "../components/NavBar";
import FooterBar from "../components/FooterBar";
import CookieConsentBanner from "../components/CookieConsentBanner";
import ErrorBoundary from "../components/ErrorBoundary";
import { sendEvent } from "../lib/analytics";
import "../styles/globals.css";

export default function MyApp({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      sendEvent("frontend_error", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      sendEvent("frontend_error", {
        message: event.reason?.message || "Unhandled rejection",
        reason: String(event.reason),
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return (
    <SessionProvider session={session}>
      <Head>
        <title>Note2Tabs</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
        <NavBar />
        <main className="flex-1">
          <ErrorBoundary>
            <Component {...pageProps} />
          </ErrorBoundary>
        </main>
        <FooterBar />
        <CookieConsentBanner />
      </div>
    </SessionProvider>
  );
}
