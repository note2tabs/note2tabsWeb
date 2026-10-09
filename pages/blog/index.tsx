import { useLocale } from "../../lib/i18n/react";
import type { GetServerSideProps } from "next";
import Link from "../../components/LocaleLink";
import { prisma } from "../../lib/prisma";
import { withPrismaReadRetry } from "../../lib/prismaRetry";
import { BLOG_PAGE_SIZE, estimateReadingTime, getPublishedWhere } from "../../lib/blog";
import BlogPostCard from "../../components/blog/BlogPostCard";
import BlogProductLink from "../../components/blog/BlogProductLink";
import SeoHead, { ORGANIZATION_ID, WEBSITE_ID, absoluteUrl } from "../../components/SeoHead";

type BlogPostCard = {
  updatedAt?: string;
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImageUrl: string | null;
  publishedAt: string | null;
  readingMinutes: number;
  categories: { category: { id: string; name: string; slug: string } }[];
  tags: { tag: { id: string; name: string; slug: string } }[];
  clusters: { cluster: { id: string; name: string; slug: string }; isPillar: boolean }[];
};

type Props = {
  posts: BlogPostCard[];
  pillars: BlogPostCard[];
  categories: { id: string; name: string; slug: string }[];
  tags: { id: string; name: string; slug: string }[];
  total: number;
  page: number;
  pageCount: number;
  activeCategory: string | null;
  activeTag: string | null;
  dataUnavailable?: boolean;
};

export default function BlogIndexPage({
  posts,
  pillars,
  categories,
  tags,
  total,
  page,
  pageCount,
  activeCategory,
  activeTag,
  dataUnavailable = false,
}: Props) {
  const { t, href: localePath } = useLocale();
  const pageParams = new URLSearchParams();
  if (activeCategory) pageParams.set("category", activeCategory);
  if (activeTag) pageParams.set("tag", activeTag);

  const buildPageLink = (nextPage: number) => {
    const params = new URLSearchParams(pageParams);
    params.set("page", String(nextPage));
    return `/blog?${params.toString()}`;
  };
  const description =
    "Learn how to create, arrange, transcribe, and practice guitar tabs with practical guides from Note2Tabs.";
  const blogJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "Note2Tabs Blog",
      url: absoluteUrl("/blog"),
      description,
      isPartOf: { "@id": WEBSITE_ID },
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: absoluteUrl("/"),
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Blog",
          item: absoluteUrl("/blog"),
        },
      ],
    },
  ];

  return (
    <main className="page blog-page">
      <SeoHead
        title={t("Blog | Note2Tabs")}
        description={description}
        canonicalPath="/blog"
        rssUrl={localePath("/blog/rss.xml")}
        noindex={Boolean(activeCategory || activeTag || page > 1)}
        jsonLd={blogJsonLd}
      />
      <div className="container stack">
        <header className="blog-hero">
          <div className="blog-hero-copy">
            <span className="blog-kicker">{t("Note2Tabs journal")}</span>
            <h1 className="page-title">{t("Ideas and practical guides for guitarists")}</h1>
            <p className="page-subtitle">
              {t("Thoughtful guides on hearing, writing, transcribing, and practising music on guitar.")}</p>
            <div className="blog-product-links" aria-label={t("Try Note2Tabs")}>
              <BlogProductLink href="/editor" cta="blog_editor" placement="blog_index_hero" className="button-primary">{t("Try the tab editor")}</BlogProductLink>
              <BlogProductLink href="/transcribe" cta="blog_transcribe" placement="blog_index_hero" className="button-secondary">{t("Transcribe audio")}</BlogProductLink>
            </div>
          </div>
        </header>

        {pillars.length > 0 && (
          <section className="blog-section blog-feature">
            <h2 className="section-title">{t("Pillar guides")}</h2>
            <div className="blog-grid">
              {pillars.map((post) => (
                <BlogPostCard
                  key={post.id}
                  slug={post.slug}
                  title={post.title}
                  excerpt={post.excerpt}
                  coverImageUrl={post.coverImageUrl}
                  publishedAt={post.publishedAt}
                  readingMinutes={post.readingMinutes}
                  chips={post.categories.slice(0, 3).map((item) => ({
                    id: item.category.id,
                    name: item.category.name,
                    href: `/blog/category/${item.category.slug}`,
                  }))}
                  variant="featured"
                />
              ))}
            </div>
          </section>
        )}

        <section className="blog-section blog-filters">
          <div className="filter-group">
            <span className="filter-label">{t("Categories")}</span>
            <div className="filter-links">
              <Link href="/blog" className={!activeCategory ? "active" : ""}>
                {t("All")}</Link>
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/blog?category=${category.slug}`}
                  className={activeCategory === category.slug ? "active" : ""}
                >
                  {t(category.name)}
                </Link>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">{t("Tags")}</span>
            <div className="filter-links">
              <Link href="/blog" className={!activeTag ? "active" : ""}>
                {t("All")}</Link>
              {tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/blog?tag=${tag.slug}`}
                  className={activeTag === tag.slug ? "active" : ""}
                >
                  {t(tag.name)}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="blog-section">
          <h2 className="section-title">{t("Latest posts")}</h2>
          {posts.length === 0 && (
            <div className="blog-empty stack-tight" role={dataUnavailable ? "status" : undefined}>
              <strong>{t(dataUnavailable ? "The guides are temporarily unavailable." : "No posts found for this filter.")}</strong>
              {dataUnavailable && (
                <span>{t("Try again shortly, or continue with the editor and transcriber while the library reconnects.")}</span>
              )}
              {dataUnavailable && (
                <div className="button-row">
                  <Link href="/blog" className="button-secondary button-small">{t("Try again")}</Link>
                  <Link href="/editor" className="button-primary button-small">{t("Open the editor")}</Link>
                </div>
              )}
            </div>
          )}
          <div className="blog-grid">
            {posts.map((post) => (
              <BlogPostCard
                key={post.id}
                slug={post.slug}
                title={post.title}
                excerpt={post.excerpt}
                coverImageUrl={post.coverImageUrl}
                publishedAt={post.publishedAt}
                readingMinutes={post.readingMinutes}
                chips={post.categories.slice(0, 3).map((item) => ({
                  id: item.category.id,
                  name: item.category.name,
                  href: `/blog/category/${item.category.slug}`,
                }))}
              />
            ))}
          </div>
        </section>

        {pageCount > 1 && (
          <nav className="pagination">
            <span>
              {t("Page ")}{page} {t(" of ")}{pageCount} {t(" · ")}{total} {t(" posts")}</span>
            <div className="pagination-links">
              {page > 1 && (
                <Link href={buildPageLink(page - 1)}>{t("Previous")}</Link>
              )}
              {page < pageCount && (
                <Link href={buildPageLink(page + 1)}>{t("Next")}</Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  ctx.res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  const page = Math.max(1, Number(ctx.query.page || 1));
  const activeCategory = typeof ctx.query.category === "string" ? ctx.query.category : null;
  const activeTag = typeof ctx.query.tag === "string" ? ctx.query.tag : null;
  const where: any = { ...getPublishedWhere() };

  if (activeCategory) {
    where.categories = { some: { category: { slug: activeCategory } } };
  }
  if (activeTag) {
    where.tags = { some: { tag: { slug: activeTag } } };
  }

  let total = 0;
  let postsRaw: any[] = [];
  let categories: Array<{ id: string; name: string; slug: string }> = [];
  let tags: Array<{ id: string; name: string; slug: string }> = [];
  let pillarsRaw: any[] = [];
  let dataUnavailable = false;
  try {
    [total, postsRaw, categories, tags, pillarsRaw] = await withPrismaReadRetry(() =>
      prisma.$transaction([
      prisma.post.count({ where }),
      prisma.post.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * BLOG_PAGE_SIZE,
      take: BLOG_PAGE_SIZE,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        slug: true,
        excerpt: true,
        content: true,
        coverImageUrl: true,
        publishedAt: true,
        categories: {
          select: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        tags: {
          select: {
            tag: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        clusters: {
          select: {
            isPillar: true,
            cluster: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      }),
      prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
      prisma.tag.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } }),
      prisma.post.findMany({
      where: {
        ...getPublishedWhere(),
        clusters: { some: { isPillar: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      take: 3,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        slug: true,
        excerpt: true,
        content: true,
        coverImageUrl: true,
        publishedAt: true,
        categories: {
          select: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        tags: {
          select: {
            tag: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        clusters: {
          select: {
            isPillar: true,
            cluster: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      }),
      ])
    );
  } catch (error) {
    dataUnavailable = true;
    ctx.res.setHeader("Cache-Control", "no-store");
    console.error("blog index lookup failed", error);
  }

  const mapPost = (post: any): BlogPostCard => ({
    id: post.id,
    title: post.title,
    updatedAt: post.updatedAt.toISOString(),
    slug: post.slug,
    excerpt: post.excerpt,
    coverImageUrl: post.coverImageUrl,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    readingMinutes: estimateReadingTime(post.content || "").minutes,
    categories: post.categories,
    tags: post.tags,
    clusters: post.clusters,
  });

  return {
    props: {
      posts: postsRaw.map(mapPost),
      pillars: pillarsRaw.map(mapPost),
      categories,
      tags,
      total,
      page,
      pageCount: Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE)),
      activeCategory,
      activeTag,
      dataUnavailable,
    },
  };
};
