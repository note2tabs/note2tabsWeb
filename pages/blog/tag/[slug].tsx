import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { estimateReadingTime, getPublishedWhere } from "../../../lib/blog";

type TagPageProps = {
  tag: { name: string; slug: string };
  posts: { id: string; title: string; slug: string; excerpt: string; readingMinutes: number }[];
};

export default function BlogTagPage({ tag, posts }: TagPageProps) {
  return (
    <main className="page blog-page">
      <Head>
        <title>{tag.name} | Note2Tabs Blog</title>
        <meta name="description" content={`Articles tagged with ${tag.name}.`} />
      </Head>
      <div className="container stack">
        <header className="page-header">
          <div>
            <h1 className="page-title">Tag: {tag.name}</h1>
            <p className="page-subtitle">Posts that cover this topic.</p>
          </div>
          <Link href="/blog" className="button-secondary button-small">
            Back to blog
          </Link>
        </header>

        <section>
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
                </div>
              </article>
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
      })),
    },
  };
};
