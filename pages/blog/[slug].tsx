import type { GetServerSideProps } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../api/auth/[...nextauth]";
import { hasFreshUserRole } from "../../lib/serverAuth";
import { prisma } from "../../lib/prisma";
import { withPrismaReadRetry } from "../../lib/prismaRetry";
import { estimateReadingTime, getPublishedWhere } from "../../lib/blog";
import { compilePostContent, parseStoredToc } from "../../lib/blogContent";
import { normalizeCanonicalUrl } from "../../lib/canonical";
import BlogPostCard from "../../components/blog/BlogPostCard";
import BlogProductLink from "../../components/blog/BlogProductLink";
import SeoHead, { ORGANIZATION_ID, WEBSITE_ID, absoluteUrl } from "../../components/SeoHead";
import { formatBlogDate } from "../../lib/dateFormat";
import { getBlogProductPaths } from "../../lib/blogProductPaths";

const ADMIN_ROLES = new Set(["ADMIN"]);

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
  readingMinutes: number;
  wordCount: number;
  toc: { id: string; text: string; level: number }[];
  relatedPosts: { id: string; title: string; slug: string }[];
};

export default function BlogPostPage({ post, readingMinutes, wordCount, toc, relatedPosts }: PostPageProps) {
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt;
  const canonical = normalizeCanonicalUrl(post.canonicalUrl) || absoluteUrl(`/blog/${post.slug}`);
  const ogImage = post.coverImageUrl || absoluteUrl(`/api/og?title=${encodeURIComponent(title)}`);
  const published = post.publishedAt || post.publishAt || undefined;
  const displayDate = formatBlogDate(post.publishedAt ?? post.publishAt);
  const updatedDate = formatBlogDate(post.updatedAt);
  const wasUpdated = Boolean(updatedDate && displayDate && updatedDate !== displayDate);
  const hasTaxonomy = post.categories.length > 0 || post.tags.length > 0 || post.clusters.length > 0;
  const pageTitle = /\bNote2Tabs\b/i.test(title) ? title : `${title} | Note2Tabs`;
  const isTranscriptionGuide = /\b(audio|ai|youtube|mp3|wav|transcri|song-to)\b/i.test(
    `${post.slug} ${post.title} ${post.tags.map((tag) => tag.name).join(" ")}`
  );
  const productPaths = getBlogProductPaths(post.slug, post.title);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `${canonical}#article`,
    headline: post.title,
    description,
    datePublished: published,
    dateModified: new Date(post.updatedAt).toISOString(),
    author: {
      "@type": "Person",
      name: post.authorName,
      url: absoluteUrl("/about"),
    },
    wordCount,
    timeRequired: `PT${readingMinutes}M`,
    articleSection: post.categories[0]?.name,
    keywords: post.tags.map((tag) => tag.name).join(", ") || undefined,
    mainEntityOfPage: canonical,
    image: ogImage,
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID },
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
        title={pageTitle}
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
          <span className="blog-kicker">{post.categories[0]?.name || "Note2Tabs guide"}</span>
          <h1 className="post-title">{post.title}</h1>
          <p className="post-meta-line">
            <Link href="/about">{post.authorName}</Link>
            {displayDate && (
              <>
                <span aria-hidden="true">·</span>
                <span>{displayDate}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>{readingMinutes} min read</span>
          </p>
          <p className="post-lead">{post.excerpt}</p>
          <div className="post-editorial-note" aria-label="About this guide">
            <div>
              <strong>Written for the Note2Tabs workflow</strong>
              <span>
                By <Link href="/about">{post.authorName}</Link>, with direct links to the current Note2Tabs tools and their documented workflows.
              </span>
            </div>
            {wasUpdated && <span>Updated {updatedDate}</span>}
          </div>
        </header>

        {post.coverImageUrl && (
          <figure className="post-cover-shell">
            <img
              src={post.coverImageUrl}
              alt={post.title}
              className="post-cover"
              width={1200}
              height={675}
              loading="eager"
              decoding="async"
            />
          </figure>
        )}

        <section className="post-mobile-product-card" aria-label="Try Note2Tabs">
          <div>
            <strong>{isTranscriptionGuide ? "Try it with your own recording" : "Put this guide into practice"}</strong>
            <span>{isTranscriptionGuide ? "Create an editable tab from audio or YouTube." : "Open a blank tab and start in your browser."}</span>
          </div>
          <BlogProductLink
            href={isTranscriptionGuide ? "/transcribe" : "/editor"}
            articleSlug={post.slug}
            cta={isTranscriptionGuide ? "blog_transcribe" : "blog_editor"}
            placement="article_mobile_intro"
            className="button-primary button-small"
          >
            {isTranscriptionGuide ? "Try the transcriber" : "Open the editor"}
          </BlogProductLink>
        </section>

        <div className="post-reader-layout">
          <article className="post-content">
            <div className="post-prose" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
            <nav className="post-tool-paths" aria-label="Related Note2Tabs tools">
              <span className="post-product-eyebrow">Use the right tool</span>
              <div>
                {productPaths.map((path) => (
                  <BlogProductLink
                    key={path.href}
                    href={path.href}
                    articleSlug={post.slug}
                    cta="blog_related_tool"
                    placement="article_contextual_links"
                  >
                    <strong>{path.label}</strong>
                    <span>{path.description}</span>
                  </BlogProductLink>
                ))}
              </div>
            </nav>
          </article>
          <aside className="post-reader-rail" aria-label="Article navigation and Note2Tabs tools">
            {toc.length > 1 && (
              <nav className="toc" aria-label="On this page">
                <h2>On this page</h2>
                <ul>
                  {toc.map((item) => (
                    <li key={item.id} className={`toc-level-${item.level}`}>
                      <a href={`#${item.id}`}>{item.text}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <section className="post-product-card">
              <span className="post-product-eyebrow">Try Note2Tabs</span>
              <h2>{isTranscriptionGuide ? "Turn a recording into playable tabs" : "Put this guide into practice"}</h2>
              <p>
                {isTranscriptionGuide
                  ? "Create a structured transcription, then open it in the editor—or use either tool on its own."
                  : "Write, arrange, play back, and export guitar tabs in the browser. No transcription required."}
              </p>
              <BlogProductLink
                href={isTranscriptionGuide ? "/transcribe" : "/editor"}
                articleSlug={post.slug}
                cta={isTranscriptionGuide ? "blog_transcribe" : "blog_editor"}
                placement="article_sidebar_primary"
                className="button-primary"
              >
                {isTranscriptionGuide ? "Transcribe a song" : "Open the editor"}
              </BlogProductLink>
              <BlogProductLink
                href={isTranscriptionGuide ? "/editor" : "/transcribe"}
                articleSlug={post.slug}
                cta={isTranscriptionGuide ? "blog_editor" : "blog_transcribe"}
                placement="article_sidebar_secondary"
                className="post-product-link"
              >
                {isTranscriptionGuide ? "Or create a tab yourself" : "Or transcribe a recording"} →
              </BlogProductLink>
            </section>
          </aside>
        </div>

        <section className="post-end-cta" aria-labelledby="post-end-cta-title">
          <div>
            <span className="post-product-eyebrow">Two complete tools</span>
            <h2 id="post-end-cta-title">Take your next tab from idea to playback</h2>
            <p>
              Build tabs directly in the editor, transcribe a recording, or move naturally between both.
            </p>
          </div>
          <div className="post-end-cta-actions">
            <BlogProductLink href="/editor" articleSlug={post.slug} cta="blog_editor" placement="article_end" className="button-primary">Try the tab editor</BlogProductLink>
            <BlogProductLink href="/transcribe" articleSlug={post.slug} cta="blog_transcribe" placement="article_end" className="button-secondary">Transcribe audio</BlogProductLink>
          </div>
        </section>

        {hasTaxonomy && (
          <section className="post-taxonomy post-taxonomy--inline">
            {post.categories.length > 0 && (
              <>
                <h2>Categories</h2>
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
                <h2>Tags</h2>
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
                <h2>Topic clusters</h2>
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

  const postSelect = {
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
  } as const;

  let post = await withPrismaReadRetry(() => prisma.post.findFirst({
    where: { slug, ...getPublishedWhere() },
    select: postSelect,
  }));
  let allowDraft = false;

  if (!post) {
    const hasSessionCookie = Boolean(
      ctx.req.cookies["next-auth.session-token"] ||
      ctx.req.cookies["__Secure-next-auth.session-token"]
    );
    if (ctx.preview || hasSessionCookie) {
      const session = await getServerSession(ctx.req, ctx.res, authOptions);
      allowDraft = Boolean(ctx.preview || (await hasFreshUserRole(session, ADMIN_ROLES)));
      if (allowDraft) {
        post = await withPrismaReadRetry(() =>
          prisma.post.findFirst({ where: { slug }, select: postSelect })
        );
      }
    }
  }

  if (!post) {
    return { notFound: true };
  }
  if (!allowDraft) {
    ctx.res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  }

  let contentHtml = post.contentHtml || "";
  let contentToc = parseStoredToc(post.contentToc);
  if (post.contentMode === "LATEX") {
    const compiled = await compilePostContent(post.content, post.contentMode, { title: post.title });
    contentHtml = compiled.contentHtml;
    contentToc = compiled.contentToc;
  } else if (!contentHtml) {
    const compiled = await compilePostContent(post.content, post.contentMode, { title: post.title });
    contentHtml = compiled.contentHtml;
    contentToc = compiled.contentToc;
  }
  const { minutes, words } = estimateReadingTime(post.content);

  const tagIds = post.tags.map((tag) => tag.tagId);
  const clusterIds = post.clusters.map((cluster) => cluster.clusterId);

  const relatedPosts = await withPrismaReadRetry(() => prisma.post.findMany({
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
  }));

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
      readingMinutes: minutes,
      wordCount: words,
      toc: contentToc,
      relatedPosts,
    },
  };
};
