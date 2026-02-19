import Link from "next/link";

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
  const publishedLabel = publishedAt ? new Date(publishedAt).toLocaleDateString() : null;

  return (
    <article className={`blog-card blog-card--${variant}`}>
      <Link href={`/blog/${slug}`} className="blog-card-media-link" aria-label={title}>
        {coverImageUrl ? (
          <img src={coverImageUrl} alt={title} className="blog-card-cover" loading="lazy" />
        ) : (
          <div className="blog-card-cover blog-card-cover--placeholder">
            <span>Note2Tabs</span>
          </div>
        )}
      </Link>

      <div className="blog-card-body">
        <Link href={`/blog/${slug}`} className="blog-card-title">
          {title}
        </Link>
        {excerpt && <p className="blog-card-excerpt">{excerpt}</p>}

        {(readingMinutes || publishedLabel) && (
          <div className="blog-card-meta">
            {typeof readingMinutes === "number" && <span>{readingMinutes} min read</span>}
            {publishedLabel && <span>{publishedLabel}</span>}
          </div>
        )}

        {chips.length > 0 && (
          <div className="blog-card-tags">
            {chips.map((chip) => (
              <Link key={chip.id} href={chip.href}>
                {chip.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

