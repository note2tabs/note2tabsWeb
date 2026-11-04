import {isLocalizedPublicPath,localeFromPath} from "./locale";
import {requestPricingMarket,PRICING_MARKET_COOKIE} from "../pricingMarket";
import {displayCurrencyForCountry,DISPLAY_CURRENCY_COOKIE} from "../localizedPricing";
import {PRICE_TAX_NOTE_COOKIE,showPriceTaxNoteForCountry} from "../priceTaxNote";

export function publicDocumentGeoCookies(path:string, method:string|undefined, headers:Record<string,string|string[]|undefined>) {
  const country=headers["x-vercel-ip-country"];
  if (method !== "GET" || typeof country !== "string" || !String(headers.accept || "").includes("text/html") || headers["x-nextjs-data"] || localeFromPath(path)==="en" || !isLocalizedPublicPath(path)) return null;
  const secure=process.env.NODE_ENV==="production" ? "; Secure" : "";
  const suffix=`; Path=/; SameSite=Lax${secure}`;
  return [
    `${PRICING_MARKET_COOKIE}=${requestPricingMarket(country)}${suffix}`,
    `${DISPLAY_CURRENCY_COOKIE}=${displayCurrencyForCountry(country)}; Max-Age=2592000${suffix}`,
    `${PRICE_TAX_NOTE_COOKIE}=${showPriceTaxNoteForCountry(country)?"1":"0"}${suffix}`,
  ];
}

export function geoCookieScript(cookies:string[]) {
  return cookies.map(cookie=>`document.cookie=${JSON.stringify(cookie)};`).join("").replace(/</g,"\\u003c");
}
