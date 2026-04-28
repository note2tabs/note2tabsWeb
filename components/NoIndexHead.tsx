import SeoHead from "./SeoHead";

type NoIndexHeadProps = {
  title: string;
  canonicalPath: string;
  description?: string;
};

export default function NoIndexHead({ title, canonicalPath, description }: NoIndexHeadProps) {
  return (
    <SeoHead
      title={title}
      canonicalPath={canonicalPath}
      description={description || "Account page for Note2Tabs."}
      noindex
    />
  );
}
