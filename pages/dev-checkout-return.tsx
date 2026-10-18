import type {GetServerSideProps} from "next";
import CheckoutCancellationTracker from "../components/CheckoutCancellationTracker";
import {ALL_LOCALES} from "../lib/i18n/locale";
export default function Preview({messages, rtl}: {messages: Record<string,string>; rtl: boolean}) {
  return <CheckoutCancellationTracker preview previewMessages={messages} previewRtl={rtl} />;
}
export const getServerSideProps: GetServerSideProps = async ({query}) => {
  if (process.env.NODE_ENV !== "development") return {notFound: true};
  const locale = typeof query.locale === "string" && (ALL_LOCALES as readonly string[]).includes(query.locale) ? query.locale : "en";
  const messages = (await import(`../lib/i18n/${locale}.json`)).default;
  return {props: {messages, rtl: locale === "ar"}};
};
