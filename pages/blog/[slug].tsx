import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { estimateReadingTime, getBaseUrl, getPublishedWhere } from "../../lib/blog";
import { renderMarkdown, type TocItem } from "../../lib/markdown";
import BlogPostCard from "../../components/blog/BlogPostCard";

type PostPageProps = {
  post: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    contentHtml: string;
    coverImageUrl: string | null;
    publishedAt: string | null;
    publishAt: string | null;
    updatedAt: string;
    authorName: string;
    seoTitle: string | null;
    seoDescription: string | null;
    canonicalUrl: string | null;
    categories: { id: string; name: string; slug: string }[];
    tags: { id: string; name: string; slug: string }[];
    clusters: { id: string; name: string; slug: string; isPillar: boolean }[];
  };
  toc: TocItem[];
  readingMinutes: number;
  relatedPosts: { id: string; title: string; slug: string }[];
};

export default function BlogPostPage({ post, toc, readingMinutes, relatedPosts }: PostPageProps) {
  const baseUrl = getBaseUrl();
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt;
  const canonical = post.canonicalUrl || `${baseUrl}/blog/${post.slug}`;
  const ogImage = post.coverImageUrl || `${baseUrl}/api/og?title=${encodeURIComponent(title)}`;
  const published = post.publishedAt || post.publishAt || undefined;
  const displayDate = post.publishedAt ?? post.publishAt;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description,
    datePublished: published,
    dateModified: new Date(post.updatedAt).toISOString(),
    author: {
      "@type": "Person",
      name: post.authorName,
    },
    mainEntityOfPage: canonical,
    image: ogImage,
  };

  return (
    <main className="page blog-post">
      <Head>
        <title>{title} | Note2Tabs</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={ogImage} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />
        {published && <meta property="article:published_time" content={published} />}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </Head>

      <div className="container stack">
        <header className={`post-header${post.coverImageUrl ? "" : " post-header--no-cover"}`}>
          <div>
            <p className="blog-breadcrumb">
              <Link href="/blog">Blog</Link> <span>/</span> <span>{post.title}</span>
            </p>
            <Link href="/blog" className="back-link">
              ← Back to blog
            </Link>
            <h1 className="page-title">{post.title}</h1>
            <p className="page-subtitle">{post.excerpt}</p>
            <div className="post-meta">
              <span>{post.authorName}</span>
              {displayDate && (
                <span>{new Date(displayDate).toLocaleDateString()}</span>
              )}
              <span>{readingMinutes} min read</span>
            </div>
          </div>
          {post.coverImageUrl && (
            <div className="post-cover-shell">
              <img src={post.coverImageUrl} alt={post.title} className="post-cover" />
            </div>
          )}
        </header>

        <div className="post-layout">
          <article className="post-content">
            <div className="post-prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
          </article>
          <aside className="post-aside">
            {toc.length > 0 && (
              <div className="toc">
                <h3>On this page</h3>
                <ul>
                  {toc.map((item) => (
                    <li key={item.id} className={`toc-level-${item.level}`}>
                      <a href={`#${item.id}`}>{item.text}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="post-taxonomy">
              {post.categories.length > 0 && (
                <>
                  <h4>Categories</h4>
                  <div className="tag-row">
                    {post.categories.map((cat) => (
                      <Link key={cat.id} href={`/blog/category/${cat.slug}`}>
                        {cat.name}
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {post.tags.length > 0 && (
                <>
                  <h4>Tags</h4>
                  <div className="tag-row">
                    {post.tags.map((tag) => (
                      <Link key={tag.id} href={`/blog/tag/${tag.slug}`}>
                        {tag.name}
                      </Link>
                    ))}
                  </div>
                </>
              )}
              {post.clusters.length > 0 && (
                <>
                  <h4>Topic clusters</h4>
                  <div className="tag-row">
                    {post.clusters.map((cluster) => (
                      <Link key={cluster.id} href={`/blog/cluster/${cluster.slug}`}>
                        {cluster.name}
                        {cluster.isPillar ? " (pillar)" : ""}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </aside>
        </div>

        {relatedPosts.length > 0 && (
          <section className="related-posts blog-section">
            <h2 className="section-title">Related posts</h2>
            <div className="blog-grid">
              {relatedPosts.map((rel) => (
                <BlogPostCard key={rel.id} slug={rel.slug} title={rel.title} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<PostPageProps> = async (ctx) => {
  const slug = ctx.params?.slug as string;
  if (!slug) {
    return { notFound: true };
  }

  const session = await getServerSession(ctx.req, ctx.res, authOptions);
  const isAdmin = session?.user?.role === "ADMIN";
  const allowDraft = Boolean(ctx.preview || isAdmin);

  const where = allowDraft
    ? { slug }
    : { slug, ...getPublishedWhere() };

  const post = await prisma.post.findFirst({
    where,
    include: {
      author: { select: { name: true, email: true } },
      categories: { include: { category: true } },
      tags: { include: { tag: true } },
      clusters: { include: { cluster: true } },
    },
  });

  if (!post) {
    return { notFound: true };
  }

  const { html, toc } = await renderMarkdown(post.content);
  const { minutes } = estimateReadingTime(post.content);

  const tagIds = post.tags.map((tag) => tag.tagId);
  const clusterIds = post.clusters.map((cluster) => cluster.clusterId);

  const relatedPosts = await prisma.post.findMany({
    where: {
      id: { not: post.id },
      ...getPublishedWhere(),
      OR: [
        tagIds.length ? { tags: { some: { tagId: { in: tagIds } } } } : undefined,
        clusterIds.length ? { clusters: { some: { clusterId: { in: clusterIds } } } } : undefined,
      ].filter(Boolean) as any,
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 4,
    select: { id: true, title: true, slug: true },
  });

  return {
    props: {
      post: {
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        contentHtml: html,
        coverImageUrl: post.coverImageUrl,
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
        publishAt: post.publishAt ? post.publishAt.toISOString() : null,
        updatedAt: post.updatedAt.toISOString(),
        authorName: post.author.name || post.author.email || "Note2Tabs",
        seoTitle: post.seoTitle,
        seoDescription: post.seoDescription,
        canonicalUrl: post.canonicalUrl,
        categories: post.categories.map((item) => item.category),
        tags: post.tags.map((item) => item.tag),
        clusters: post.clusters.map((item) => ({
          ...item.cluster,
          isPillar: item.isPillar,
        })),
      },
      toc,
      readingMinutes: minutes,
      relatedPosts,
    },
  };
};
