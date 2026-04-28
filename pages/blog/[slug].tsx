import type { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { prisma } from "../../lib/prisma";
import { estimateReadingTime, getPublishedWhere } from "../../lib/blog";
import type { TocItem } from "../../lib/markdown";
import { compilePostContent, parseStoredToc } from "../../lib/blogContent";
import BlogPostCard from "../../components/blog/BlogPostCard";
import SeoHead, { absoluteUrl } from "../../components/SeoHead";

type PostPageProps = {
  post: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    contentMode: "PLAIN" | "LATEX";
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
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt;
  const canonical = post.canonicalUrl || absoluteUrl(`/blog/${post.slug}`);
  const ogImage = post.coverImageUrl || absoluteUrl(`/api/og?title=${encodeURIComponent(title)}`);
  const published = post.publishedAt || post.publishAt || undefined;
  const displayDate = post.publishedAt ?? post.publishAt;
  const hasTaxonomy = post.categories.length > 0 || post.tags.length > 0 || post.clusters.length > 0;
  const showAside = toc.length > 0 || hasTaxonomy;

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
  const breadcrumbJsonLd = {
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
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: canonical,
      },
    ],
  };

  return (
    <main className="page blog-post">
      <SeoHead
        title={`${title} | Note2Tabs`}
        description={description}
        canonicalUrl={canonical}
        imageUrl={ogImage}
        ogType="article"
        articlePublishedTime={published}
        articleModifiedTime={new Date(post.updatedAt).toISOString()}
        jsonLd={[jsonLd, breadcrumbJsonLd]}
      />

      <div className="container stack">
        <header className="post-header post-header--reader">
          <p className="blog-breadcrumb">
            <Link href="/blog">Blog</Link> <span>/</span> <span>{post.title}</span>
          </p>
          <Link href="/blog" className="back-link">
            ← Back to blog
          </Link>
          <h1 className="post-title">{post.title}</h1>
          <p className="post-meta-line">
            <span>{post.authorName}</span>
            {displayDate && (
              <>
                <span aria-hidden="true">·</span>
                <span>{new Date(displayDate).toLocaleDateString()}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{readingMinutes} min read</span>
          </p>
          <p className="post-lead">{post.excerpt}</p>
        </header>

        {post.coverImageUrl && (
          <figure className="post-cover-shell">
            <img src={post.coverImageUrl} alt={post.title} className="post-cover" />
          </figure>
        )}

        <div className={showAside ? "post-layout" : undefined}>
          <article className="post-content">
            <div className="post-prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
          </article>
          {showAside && (
            <aside className="post-aside">
              {toc.length > 0 && (
                <nav className="toc" aria-label="Table of contents">
                  <h3>On this page</h3>
                  <ul>
                    {toc.map((item) => (
                      <li
                        key={item.id}
                        className={
                          item.level >= 4 ? "toc-level-4" : item.level >= 3 ? "toc-level-3" : undefined
                        }
                      >
                        <a href={`#${item.id}`}>{item.text}</a>
                      </li>
                    ))}
                  </ul>
                </nav>
              )}

              {hasTaxonomy && (
                <section className="post-taxonomy">
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
                </section>
              )}
            </aside>
          )}
        </div>

        {hasTaxonomy && (
          <section className="post-taxonomy post-taxonomy--inline">
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
          </section>
        )}

        {relatedPosts.length > 0 && (
          <section className="related-posts">
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
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      contentHtml: true,
      contentToc: true,
      contentMode: true,
      coverImageUrl: true,
      publishedAt: true,
      publishAt: true,
      updatedAt: true,
      seoTitle: true,
      seoDescription: true,
      canonicalUrl: true,
      author: { select: { name: true, email: true } },
      categories: {
        select: {
          category: { select: { id: true, name: true, slug: true } },
        },
      },
      tags: {
        select: {
          tagId: true,
          tag: { select: { id: true, name: true, slug: true } },
        },
      },
      clusters: {
        select: {
          clusterId: true,
          isPillar: true,
          cluster: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!post) {
    return { notFound: true };
  }
  if (!allowDraft) {
    ctx.res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  }

  let contentHtml = post.contentHtml || "";
  let toc = parseStoredToc(post.contentToc);
  if (post.contentMode === "LATEX") {
    const compiled = await compilePostContent(post.content, post.contentMode);
    contentHtml = compiled.contentHtml;
    toc = compiled.contentToc;
  } else if (!contentHtml || toc.length === 0) {
    const compiled = await compilePostContent(post.content, post.contentMode);
    if (!contentHtml) contentHtml = compiled.contentHtml;
    if (toc.length === 0) toc = compiled.contentToc;
  }
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
        contentMode: post.contentMode,
        contentHtml,
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
