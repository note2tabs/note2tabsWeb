import { withLocalizedBlogStaticPage } from "../../../../lib/i18n/blog/localize";
export { default } from "../../../blog/tag/[slug]";
import { getStaticProps as loadPage } from "../../../blog/tag/[slug]";
export const getServerSideProps = withLocalizedBlogStaticPage("ar", loadPage);
