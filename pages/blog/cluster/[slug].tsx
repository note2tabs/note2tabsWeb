import { useLocale } from "../../../lib/i18n/react";
import type { GetStaticPaths, GetStaticProps } from "next";
import Link from "../../../components/LocaleLink";
import { prisma } from "../../../lib/prisma";
import { withPrismaReadRetry } from "../../../lib/prismaRetry";
import { estimateReadingTime, getPublishedWhere } from "../../../lib/blog";
import BlogPostCard from "../../../components/blog/BlogPostCard";
import SeoHead, { absoluteUrl } from "../../../components/SeoHead";
import { shouldIndexBlogArchive } from "../../../lib/blogIndexPolicy";

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
  const { t } = useLocale();
  const description = cluster.description || t("Explore the {name} topic cluster.", {name: t(cluster.name)});
  const canonicalPath = `/blog/cluster/${cluster.slug}`;
  const jsonLd = {
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
        name: cluster.name,
        item: absoluteUrl(canonicalPath),
      },
    ],
  };

  return (
    <main className="page blog-page">
      <SeoHead
        title={t("{name} Topic Hub | Note2Tabs Blog", {name: t(cluster.name)})}
        description={description}
        canonicalPath={canonicalPath}
        noindex={!shouldIndexBlogArchive("cluster", cluster.slug)}
        jsonLd={jsonLd}
      />
      <div className="container stack">
        <header className="blog-hero blog-hero--compact">
          <div className="blog-hero-copy">
            <p className="blog-breadcrumb">
              <Link href="/blog">{t("Blog")}</Link> <span>{t("/")}</span> {t(" Cluster")}</p>
            <h1 className="page-title">{t(cluster.name)}</h1>
            <p className="page-subtitle">
              {t(cluster.description || "Topic cluster map with pillar and supporting guides.")}
            </p>
          </div>
          <div className="blog-hero-actions">
            <div className="blog-hero-metrics">
              {pillarPost && <span>{t("1 pillar guide")}</span>}
              <span>{supportingPosts.length} {t(" supporting guides")}</span>
            </div>
            <Link href="/blog" className="button-secondary button-small">
              {t("Back to blog")}</Link>
          </div>
        </header>

        {pillarPost && (
          <section className="blog-section blog-feature">
            <h2 className="section-title">{t("Pillar post")}</h2>
            <BlogPostCard
              slug={pillarPost.slug}
              title={t(pillarPost.title)}
              excerpt={pillarPost.excerpt}
              coverImageUrl={pillarPost.coverImageUrl}
              publishedAt={pillarPost.publishedAt}
              variant="featured"
            />
          </section>
        )}

        <section className="blog-section">
          <h2 className="section-title">{t("Supporting posts")}</h2>
          {supportingPosts.length === 0 && (
            <div className="blog-empty">{t("No supporting posts in this cluster yet.")}</div>
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

export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: "blocking" });

export const getStaticProps: GetStaticProps<ClusterPageProps> = async (ctx) => {
  const slug = ctx.params?.slug as string;
  const cluster = await withPrismaReadRetry(() => prisma.topicCluster.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, description: true },
  }));
  if (!cluster) {
    return { notFound: true };
  }

  const postsRaw = await withPrismaReadRetry(() => prisma.post.findMany({
    where: {
      ...getPublishedWhere(),
      clusters: { some: { clusterId: cluster.id } },
    },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
        updatedAt: true,
      slug: true,
      excerpt: true,
      content: true,
      coverImageUrl: true,
      publishedAt: true,
      clusters: {
        select: { clusterId: true, isPillar: true },
      },
    },
  }));

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
            updatedAt: pillar.updatedAt.toISOString(),
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
    updatedAt: post.updatedAt.toISOString(),
          slug: post.slug,
          excerpt: post.excerpt,
          readingMinutes: estimateReadingTime(post.content || "").minutes,
          coverImageUrl: post.coverImageUrl,
          publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
        })),
    },
    revalidate: 3600,
  };
};
