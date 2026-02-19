import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { estimateReadingTime, getPublishedWhere } from "../../../lib/blog";

type CategoryPageProps = {
  category: { name: string; slug: string; description: string | null };
  posts: { id: string; title: string; slug: string; excerpt: string; readingMinutes: number }[];
  pillarPost: { id: string; title: string; slug: string } | null;
};

export default function BlogCategoryPage({ category, posts, pillarPost }: CategoryPageProps) {
  return (
    <main className="page blog-page">
      <Head>
        <title>{category.name} | Note2Tabs Blog</title>
        <meta
          name="description"
          content={category.description || `Browse Note2Tabs posts about ${category.name}.`}
        />
      </Head>
      <div className="container stack">
        <header className="page-header">
          <div>
            <h1 className="page-title">{category.name}</h1>
            <p className="page-subtitle">
              {category.description || "Curated guides and posts for this category."}
            </p>
          </div>
          <Link href="/blog" className="button-secondary button-small">
            Back to blog
          </Link>
        </header>

        {pillarPost && (
          <section className="blog-feature">
            <h2 className="section-title">Pillar post</h2>
            <article className="blog-card">
              <Link href={`/blog/${pillarPost.slug}`} className="blog-card-title">
                {pillarPost.title}
              </Link>
            </article>
          </section>
        )}

        <section>
          <h2 className="section-title">Posts</h2>
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

export const getServerSideProps: GetServerSideProps<CategoryPageProps> = async (ctx) => {
  const slug = ctx.params?.slug as string;
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) {
    return { notFound: true };
  }

  const postsRaw = await prisma.post.findMany({
    where: {
      ...getPublishedWhere(),
      categories: { some: { categoryId: category.id } },
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    include: { clusters: true },
  });

  const pillarCandidate = postsRaw.find((post) => post.clusters.some((cluster) => cluster.isPillar));

  return {
    props: {
      category: {
        name: category.name,
        slug: category.slug,
        description: category.description,
      },
      pillarPost: pillarCandidate
        ? { id: pillarCandidate.id, title: pillarCandidate.title, slug: pillarCandidate.slug }
        : null,
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
