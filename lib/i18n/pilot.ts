import { LOCALIZED_PUBLIC_PATHS, stripLocale } from "./locale";
import { displayCurrencyForCountry, readDisplayCurrencyCookie } from "../localizedPricing";
import type { GetServerSideProps, GetServerSidePropsContext } from "next";

/** Draft translations are available in development/preview only until native/billing review. */
export function portuguesePilotAvailable() {
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview" ||
    process.env.NEXT_PUBLIC_PT_BR_REVIEWED === "true";
}
export function portuguesePilotIndexable() {
  const preview = typeof window === "undefined" ? process.env.VERCEL_ENV === "preview" : process.env.NEXT_PUBLIC_PT_BR_PREVIEW === "true";
  return process.env.NODE_ENV === "production" && !preview && process.env.NEXT_PUBLIC_PT_BR_REVIEWED === "true";
}
export function withPortuguesePilot<P extends Record<string, unknown>>(
  loader?: GetServerSideProps<P>
): GetServerSideProps<P> {
  return async (context: GetServerSidePropsContext) => {
    if (!portuguesePilotAvailable()) return { notFound: true };
    const publicPath = stripLocale(context.resolvedUrl || "/").split(/[?#]/)[0];
    context.res.setHeader("X-Robots-Tag", portuguesePilotIndexable() && LOCALIZED_PUBLIC_PATHS.includes(publicPath as typeof LOCALIZED_PUBLIC_PATHS[number]) ? "index, follow" : "noindex, follow");
    const result = loader ? await loader(context) : { props: {} as P };
    if (!("props" in result)) return result;
    const country = context.req.headers["x-vercel-ip-country"];
    const initialDisplayCurrency = typeof country === "string" ? displayCurrencyForCountry(country) : readDisplayCurrencyCookie(context.req.headers.cookie || "");
    return {...result, props: {...await result.props, initialDisplayCurrency}};
  };
}
