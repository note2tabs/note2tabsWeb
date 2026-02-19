import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { BLOG_PAGE_SIZE, estimateReadingTime, getPublishedWhere } from "../../lib/blog";

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
        <header className="page-header">
          <div>
            <h1 className="page-title">Note2Tabs Blog</h1>
            <p className="page-subtitle">
              Guides, workflows, and product updates for guitar tab creation and practice.
            </p>
          </div>
          <Link href="/" className="button-secondary button-small">
            Back to app
          </Link>
        </header>

        {pillars.length > 0 && (
          <section className="blog-feature">
            <h2 className="section-title">Pillar guides</h2>
            <div className="blog-grid">
              {pillars.map((post) => (
                <article key={post.id} className="blog-card">
                  <Link href={`/blog/${post.slug}`} className="blog-card-title">
                    {post.title}
                  </Link>
                  <p className="blog-card-excerpt">{post.excerpt}</p>
                  <div className="blog-card-meta">
                    <span>{post.readingMinutes} min read</span>
                    {post.publishedAt && <span>{new Date(post.publishedAt).toLocaleDateString()}</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="blog-filters">
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

        <section>
          <h2 className="section-title">Latest posts</h2>
          {posts.length === 0 && <p className="muted">No posts found.</p>}
          <div className="blog-grid">
            {posts.map((post) => (
              <article key={post.id} className="blog-card">
                <Link href={`/blog/${post.slug}`} className="blog-card-title">
                  {post.title}
                </Link>
                <p className="blog-card-excerpt">{post.excerpt}</p>
                <div className="blog-card-meta">
                  <span>{post.readingMinutes} min read</span>
                  {post.publishedAt && <span>{new Date(post.publishedAt).toLocaleDateString()}</span>}
                </div>
                <div className="blog-card-tags">
                  {post.categories.map((item) => (
                    <Link key={item.category.id} href={`/blog/category/${item.category.slug}`}>
                      {item.category.name}
                    </Link>
                  ))}
                </div>
              </article>
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
