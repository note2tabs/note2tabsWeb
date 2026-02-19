import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { BLOG_PAGE_SIZE, estimateReadingTime, getPublishedWhere } from "../../lib/blog";
import BlogPostCard from "../../components/blog/BlogPostCard";

type BlogPostCard = {
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
}: Props) {
  const pageParams = new URLSearchParams();
  if (activeCategory) pageParams.set("category", activeCategory);
  if (activeTag) pageParams.set("tag", activeTag);

  const buildPageLink = (nextPage: number) => {
    const params = new URLSearchParams(pageParams);
    params.set("page", String(nextPage));
    return `/blog?${params.toString()}`;
  };

  return (
    <main className="page blog-page">
      <Head>
        <title>Blog | Note2Tabs</title>
        <meta
          name="description"
          content="Learn how to convert audio into guitar tabs, edit tablature, and practice songs with Note2Tabs."
        />
      </Head>
      <div className="container stack">
        <header className="blog-hero">
          <div className="blog-hero-copy">
            <span className="blog-kicker">Knowledge Hub</span>
            <h1 className="page-title">Note2Tabs Blog</h1>
            <p className="page-subtitle">
              Practical guides, workflows, and updates for converting songs into playable guitar tabs.
            </p>
          </div>
          <div className="blog-hero-actions">
            <div className="blog-hero-metrics">
              <span>{total} published posts</span>
              <span>{categories.length} categories</span>
              <span>{tags.length} tags</span>
            </div>
            <Link href="/" className="button-secondary button-small">
              Back to app
            </Link>
          </div>
        </header>

        {pillars.length > 0 && (
          <section className="blog-section blog-feature">
            <h2 className="section-title">Pillar guides</h2>
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
            <span className="filter-label">Categories</span>
            <div className="filter-links">
              <Link href="/blog" className={!activeCategory ? "active" : ""}>
                All
              </Link>
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/blog?category=${category.slug}`}
                  className={activeCategory === category.slug ? "active" : ""}
                >
                  {category.name}
                </Link>
              ))}
            </div>
          </div>
          <div className="filter-group">
            <span className="filter-label">Tags</span>
            <div className="filter-links">
              <Link href="/blog" className={!activeTag ? "active" : ""}>
                All
              </Link>
              {tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/blog?tag=${tag.slug}`}
                  className={activeTag === tag.slug ? "active" : ""}
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="blog-section">
          <h2 className="section-title">Latest posts</h2>
          {posts.length === 0 && <div className="blog-empty">No posts found for this filter.</div>}
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
              Page {page} of {pageCount} · {total} posts
            </span>
            <div className="pagination-links">
              {page > 1 && (
                <Link href={buildPageLink(page - 1)}>Previous</Link>
              )}
              {page < pageCount && (
                <Link href={buildPageLink(page + 1)}>Next</Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
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

  const [total, postsRaw, categories, tags, pillarsRaw] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * BLOG_PAGE_SIZE,
      take: BLOG_PAGE_SIZE,
      include: {
        categories: { include: { category: true } },
        tags: { include: { tag: true } },
        clusters: { include: { cluster: true } },
      },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.post.findMany({
      where: {
        ...getPublishedWhere(),
        clusters: { some: { isPillar: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      take: 3,
      include: {
        categories: { include: { category: true } },
        tags: { include: { tag: true } },
        clusters: { include: { cluster: true } },
      },
    }),
  ]);

  const mapPost = (post: any): BlogPostCard => ({
    id: post.id,
    title: post.title,
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
    },
  };
};
