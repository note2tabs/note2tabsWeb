import type { ComponentProps } from "react";
import Link from "next/link";
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
  const destination = typeof href === "string" ? href : href.pathname || "/";

  return (
    <Link
      {...props}
      href={href}
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
