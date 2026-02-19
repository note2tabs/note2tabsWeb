import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { estimateReadingTime, getPublishedWhere } from "../../../lib/blog";

type ClusterPageProps = {
  cluster: { name: string; slug: string; description: string | null };
  pillarPost: { id: string; title: string; slug: string; excerpt: string } | null;
  supportingPosts: { id: string; title: string; slug: string; excerpt: string; readingMinutes: number }[];
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
        <header className="page-header">
          <div>
            <h1 className="page-title">{cluster.name}</h1>
            <p className="page-subtitle">
              {cluster.description || "Topic cluster map with pillar and supporting guides."}
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
              <p className="blog-card-excerpt">{pillarPost.excerpt}</p>
            </article>
          </section>
        )}

        <section>
          <h2 className="section-title">Supporting posts</h2>
          {supportingPosts.length === 0 && <p className="muted">No supporting posts yet.</p>}
          <div className="blog-grid">
            {supportingPosts.map((post) => (
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
        ? { id: pillar.id, title: pillar.title, slug: pillar.slug, excerpt: pillar.excerpt }
        : null,
      supportingPosts: postsRaw
        .filter((post) => post.id !== pillar?.id)
        .map((post) => ({
          id: post.id,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          readingMinutes: estimateReadingTime(post.content || "").minutes,
        })),
    },
  };
};
