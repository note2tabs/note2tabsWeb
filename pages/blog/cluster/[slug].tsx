import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { estimateReadingTime, getPublishedWhere } from "../../../lib/blog";
import BlogPostCard from "../../../components/blog/BlogPostCard";

type ClusterPageProps = {
  cluster: { name: string; slug: string; description: string | null };
  pillarPost: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    coverImageUrl: string | null;
    publishedAt: string | null;
  } | null;
  supportingPosts: {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    readingMinutes: number;
    coverImageUrl: string | null;
    publishedAt: string | null;
  }[];
};

export default function BlogClusterPage({ cluster, pillarPost, supportingPosts }: ClusterPageProps) {
  return (
    <main className="page blog-page">
      <Head>
        <title>{cluster.name} | Note2Tabs Blog</title>
        <meta
          name="description"
          content={cluster.description || `Explore the ${cluster.name} topic cluster.`}
        />
      </Head>
      <div className="container stack">
        <header className="blog-hero blog-hero--compact">
          <div className="blog-hero-copy">
            <p className="blog-breadcrumb">
              <Link href="/blog">Blog</Link> <span>/</span> Cluster
            </p>
            <h1 className="page-title">{cluster.name}</h1>
            <p className="page-subtitle">
              {cluster.description || "Topic cluster map with pillar and supporting guides."}
            </p>
          </div>
          <div className="blog-hero-actions">
            <div className="blog-hero-metrics">
              {pillarPost && <span>1 pillar guide</span>}
              <span>{supportingPosts.length} supporting guides</span>
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
          <h2 className="section-title">Supporting posts</h2>
          {supportingPosts.length === 0 && (
            <div className="blog-empty">No supporting posts in this cluster yet.</div>
          )}
          <div className="blog-grid">
            {supportingPosts.map((post) => (
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

export const getServerSideProps: GetServerSideProps<ClusterPageProps> = async (ctx) => {
  const slug = ctx.params?.slug as string;
  const cluster = await prisma.topicCluster.findUnique({ where: { slug } });
  if (!cluster) {
    return { notFound: true };
  }

  const postsRaw = await prisma.post.findMany({
    where: {
      ...getPublishedWhere(),
      clusters: { some: { clusterId: cluster.id } },
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    include: { clusters: true },
  });

  const pillar = postsRaw.find((post) =>
    post.clusters.some((rel) => rel.clusterId === cluster.id && rel.isPillar)
  );

  return {
    props: {
      cluster: {
        name: cluster.name,
        slug: cluster.slug,
        description: cluster.description,
      },
      pillarPost: pillar
        ? {
            id: pillar.id,
            title: pillar.title,
            slug: pillar.slug,
            excerpt: pillar.excerpt,
            coverImageUrl: pillar.coverImageUrl,
            publishedAt: pillar.publishedAt ? pillar.publishedAt.toISOString() : null,
          }
        : null,
      supportingPosts: postsRaw
        .filter((post) => post.id !== pillar?.id)
        .map((post) => ({
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
