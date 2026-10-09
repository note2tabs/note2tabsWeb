import { useLocale } from "../../lib/i18n/react";
import Link from "../LocaleLink";
import { formatBlogDate } from "../../lib/dateFormat";

type Chip = {
  id: string;
  name: string;
  href: string;
};

type BlogPostCardProps = {
  slug: string;
  title: string;
  excerpt?: string | null;
  coverImageUrl?: string | null;
  publishedAt?: string | null;
  readingMinutes?: number;
  chips?: Chip[];
  variant?: "default" | "featured";
};

export default function BlogPostCard({
  slug,
  title,
  excerpt,
  coverImageUrl,
  publishedAt,
  readingMinutes,
  chips = [],
  variant = "default",
}: BlogPostCardProps) {
  const { t, locale } = useLocale();
  const publishedLabel = formatBlogDate(publishedAt, locale);
  const hasCover = Boolean(coverImageUrl);

  return (
    <article className={`blog-card blog-card--${variant}${hasCover ? "" : " blog-card--no-cover"}`}>
      {coverImageUrl && (
        <Link href={`/blog/${slug}`} className="blog-card-media-link" aria-label={t(title)}>
          <img
            src={coverImageUrl}
            alt={t(title)}
            className="blog-card-cover"
            width={1200}
            height={675}
            loading="lazy"
            decoding="async"
          />
        </Link>
      )}

      <div className="blog-card-body">
        <h2 className="blog-card-heading">
          <Link href={`/blog/${slug}`} className="blog-card-title">
            {t(title)}
          </Link>
        </h2>
        {excerpt && <p className="blog-card-excerpt">{t(excerpt)}</p>}

        {(readingMinutes || publishedLabel) && (
          <div className="blog-card-meta">
            {typeof readingMinutes === "number" && <span>{readingMinutes} {t(" min read")}</span>}
            {publishedLabel && <span>{t(publishedLabel)}</span>}
          </div>
        )}

        {chips.length > 0 && (
          <div className="blog-card-tags">
            {chips.map((chip) => (
              <Link key={chip.id} href={chip.href}>
                {t(chip.name)}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
