import Link from "next/link";
import type { ComponentProps } from "react";
import { useLocale } from "../lib/i18n/react";
export default function LocaleLink(props: ComponentProps<typeof Link>) {
  const { href } = useLocale();
  const target = typeof props.href === "string" ? href(props.href) : {
    ...props.href, pathname: props.href.pathname ? href(props.href.pathname) : props.href.pathname,
  };
  return <Link {...props} href={target} />;
}
