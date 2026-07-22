import type { GetStaticPaths, GetStaticProps } from "next";
import FeatureLandingPage from "../../components/FeatureLandingPage";
import { getSeoFeaturePage, seoFeaturePages, type SeoFeaturePage } from "../../lib/seoFeaturePages";

type FeaturePageProps = {
  page: SeoFeaturePage;
};

export default function FeaturePage({ page }: FeaturePageProps) {
  return <FeatureLandingPage page={page} />;
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: seoFeaturePages.map((page) => ({ params: { slug: page.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<FeaturePageProps> = async ({ params }) => {
  const slug = typeof params?.slug === "string" ? params.slug : "";
  const page = getSeoFeaturePage(slug);

  if (!page) return { notFound: true };
  return { props: { page } };
};
