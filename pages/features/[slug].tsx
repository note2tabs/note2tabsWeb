import type { GetStaticPaths, GetStaticProps } from "next";
import SeoLandingPage from "../../components/SeoLandingPage";
import { getSeoFeaturePage, seoFeaturePages, type SeoFeaturePage } from "../../lib/seoFeaturePages";

type FeaturePageProps = {
  page: SeoFeaturePage;
};

export default function FeaturePage({ page }: FeaturePageProps) {
  const relatedLinks = page.relatedSlugs
    .map((slug) => getSeoFeaturePage(slug))
    .filter((related): related is SeoFeaturePage => Boolean(related))
    .map((related) => ({
      label: related.title,
      href: `/features/${related.slug}`,
      description: related.description,
    }));

  relatedLinks.push({
    label: "Online guitar tab editor",
    href: "/editor",
    description: "Open a blank tab or continue editing a transcription in your browser.",
  });

  return (
    <SeoLandingPage
      title={page.title}
      metaTitle={page.metaTitle}
      description={page.description}
      canonicalPath={`/features/${page.slug}`}
      primaryCta={{ label: "Try the editor free", href: "/editor" }}
      secondaryCta={{ label: "Transcribe audio to tabs", href: "/transcribe" }}
      steps={page.steps}
      detail={page.detail}
      contentSections={page.contentSections}
      faqs={page.faqs}
      relatedLinks={relatedLinks}
    />
  );
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
