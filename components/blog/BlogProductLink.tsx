import type { ComponentProps } from "react";
import Link from "../LocaleLink";
import { trackCtaClick } from "../../lib/analytics";

type BlogProductLinkProps = ComponentProps<typeof Link> & {
  articleSlug?: string;
  cta: string;
  placement: string;
};

export default function BlogProductLink({
  articleSlug,
  cta,
  placement,
  href,
  onClick,
  ...props
}: BlogProductLinkProps) {
  const target = href === "/editor" ? "/gte/new" : href;
  const destination = typeof target === "string" ? target : target.pathname || "/";

  return (
    <Link
      {...props}
      href={target}
      onClick={(event) => {
        trackCtaClick(cta, {
          article_slug: articleSlug,
          destination,
          placement,
          surface: "blog",
        });
        onClick?.(event);
      }}
    />
  );
}
