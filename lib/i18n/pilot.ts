import { isLocalizedPublicPath, localeSwitchHref, stripLocale, type AppLocale } from "./locale";
import { displayCurrencyForCountry, readDisplayCurrencyCookie } from "../localizedPricing";
import type { GetServerSideProps, GetServerSidePropsContext, GetStaticProps } from "next";

/** Draft translations are available in development/preview only until native/billing review. */
export function localizedPilotAvailable(locale: AppLocale) {
  if (locale === "en") return true;
  return process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview" ||
    (locale === "pt-BR" ? process.env.NEXT_PUBLIC_PT_BR_REVIEWED : process.env.NEXT_PUBLIC_ES_REVIEWED) === "true";
}
export function localizedPilotIndexable(locale: AppLocale) {
  if (locale === "en") return true;
  const preview = typeof window === "undefined" ? process.env.VERCEL_ENV === "preview" : process.env.NEXT_PUBLIC_PT_BR_PREVIEW === "true";
  return process.env.NODE_ENV === "production" && !preview && (locale === "pt-BR" ? process.env.NEXT_PUBLIC_PT_BR_REVIEWED : process.env.NEXT_PUBLIC_ES_REVIEWED) === "true";
}
export function withLocalizedPilot<P extends Record<string, unknown>>(
  locale: AppLocale, loader?: GetServerSideProps<P>
): GetServerSideProps<P> {
  return async (context: GetServerSidePropsContext) => {
    if (!localizedPilotAvailable(locale)) return { notFound: true };
    const publicPath = stripLocale(context.resolvedUrl || "/").split(/[?#]/)[0];
    context.res.setHeader("X-Robots-Tag", localizedPilotIndexable(locale) && isLocalizedPublicPath(publicPath) ? "index, follow" : "noindex, follow");
    const result = loader ? await loader(context) : { props: {} as P };
    if ("redirect" in result) return {...result, redirect: {...result.redirect, destination: localeSwitchHref(result.redirect.destination, locale)}};
    if (!("props" in result)) return result;
    const country = context.req.headers["x-vercel-ip-country"];
    const initialDisplayCurrency = typeof country === "string" ? displayCurrencyForCountry(country) : readDisplayCurrencyCookie(context.req.headers.cookie || "");
    return {...result, props: {...await result.props, initialDisplayCurrency}};
  };
}

/** Reuse the original data and authorization rules without exporting static-only fields. */
export function withLocalizedStaticPage<P extends Record<string, unknown>>(locale: AppLocale, loader: GetStaticProps<P>): GetServerSideProps<P> {
  return withLocalizedPilot<P>(locale, async (context) => {
    const result = await loader({ params: context.params, preview: context.preview, previewData: context.previewData });
    if ("notFound" in result) return {notFound: true};
    if ("redirect" in result) return {redirect: result.redirect};
    return {props: await result.props};
  });
}

export const portuguesePilotAvailable = () => localizedPilotAvailable("pt-BR");
export const portuguesePilotIndexable = () => localizedPilotIndexable("pt-BR");
export const withPortuguesePilot = <P extends Record<string, unknown>>(loader?: GetServerSideProps<P>) => withLocalizedPilot("pt-BR", loader);
export const withPortugueseStaticPage = <P extends Record<string, unknown>>(loader: GetStaticProps<P>) => withLocalizedStaticPage("pt-BR", loader);
export const withSpanishPilot = <P extends Record<string, unknown>>(loader?: GetServerSideProps<P>) => withLocalizedPilot("es", loader);
export const withSpanishStaticPage = <P extends Record<string, unknown>>(loader: GetStaticProps<P>) => withLocalizedStaticPage("es", loader);
