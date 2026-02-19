import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { estimateReadingTime, getPublishedWhere } from "../../../lib/blog";
import BlogPostCard from "../../../components/blog/BlogPostCard";

type TagPageProps = {
  tag: { name: string; slug: string };
  posts: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    readingMinutes: number;
    coverImageUrl: string | null;
    publishedAt: string | null;
  }[];
};

export default function BlogTagPage({ tag, posts }: TagPageProps) {
  return (
    <main className="page blog-page">
      <Head>
        <title>{tag.name} | Note2Tabs Blog</title>
        <meta name="description" content={`Articles tagged with ${tag.name}.`} />
      </Head>
      <div className="container stack">
        <header className="blog-hero blog-hero--compact">
          <div className="blog-hero-copy">
            <p className="blog-breadcrumb">
              <Link href="/blog">Blog</Link> <span>/</span> Tag
            </p>
            <h1 className="page-title">Tag: {tag.name}</h1>
            <p className="page-subtitle">Posts that cover this topic.</p>
          </div>
          <div className="blog-hero-actions">
            <div className="blog-hero-metrics">
              <span>{posts.length} posts</span>
            </div>
            <Link href="/blog" className="button-secondary button-small">
              Back to blog
            </Link>
          </div>
        </header>

        <section className="blog-section">
          {posts.length === 0 && <div className="blog-empty">No posts found for this tag.</div>}
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
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export const getServerSideProps: GetServerSideProps<TagPageProps> = async (ctx) => {
  const slug = ctx.params?.slug as string;
  const tag = await prisma.tag.findUnique({ where: { slug } });
  if (!tag) {
    return { notFound: true };
  }

  const postsRaw = await prisma.post.findMany({
    where: {
      ...getPublishedWhere(),
      tags: { some: { tagId: tag.id } },
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
  });

  return {
    props: {
      tag: {
        name: tag.name,
        slug: tag.slug,
      },
      posts: postsRaw.map((post) => ({
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        readingMinutes: estimateReadingTime(post.content || "").minutes,
        coverImageUrl: post.coverImageUrl,
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
      })),
    },
  };
};
