import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { estimateReadingTime, getPublishedWhere } from "../../../lib/blog";
import BlogPostCard from "../../../components/blog/BlogPostCard";

type CategoryPageProps = {
  category: { name: string; slug: string; description: string | null };
  posts: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    readingMinutes: number;
    coverImageUrl: string | null;
    publishedAt: string | null;
  }[];
  pillarPost: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    coverImageUrl: string | null;
    publishedAt: string | null;
  } | null;
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
        <header className="blog-hero blog-hero--compact">
          <div className="blog-hero-copy">
            <p className="blog-breadcrumb">
              <Link href="/blog">Blog</Link> <span>/</span> Category
            </p>
            <h1 className="page-title">{category.name}</h1>
            <p className="page-subtitle">
              {category.description || "Curated guides and posts for this category."}
            </p>
          </div>
          <div className="blog-hero-actions">
            <div className="blog-hero-metrics">
              <span>{posts.length} posts</span>
              {pillarPost && <span>Pillar included</span>}
            </div>
            <Link href="/blog" className="button-secondary button-small">
              Back to blog
            </Link>
          </div>
        </header>

        {pillarPost && (
          <section className="blog-section blog-feature">
            <h2 className="section-title">Pillar post</h2>
            <BlogPostCard
              slug={pillarPost.slug}
              title={pillarPost.title}
              excerpt={pillarPost.excerpt}
              coverImageUrl={pillarPost.coverImageUrl}
              publishedAt={pillarPost.publishedAt}
              variant="featured"
            />
          </section>
        )}

        <section className="blog-section">
          <h2 className="section-title">Posts</h2>
          {posts.length === 0 && <div className="blog-empty">No posts found in this category yet.</div>}
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
        ? {
            id: pillarCandidate.id,
            title: pillarCandidate.title,
            slug: pillarCandidate.slug,
            excerpt: pillarCandidate.excerpt,
            coverImageUrl: pillarCandidate.coverImageUrl,
            publishedAt: pillarCandidate.publishedAt ? pillarCandidate.publishedAt.toISOString() : null,
          }
        : null,
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
