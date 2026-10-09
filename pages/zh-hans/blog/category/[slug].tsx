import { withLocalizedBlogStaticPage } from "../../../../lib/i18n/blog/localize";
export { default } from "../../../blog/category/[slug]";
import { getStaticProps as loadPage } from "../../../blog/category/[slug]";
export const getServerSideProps = withLocalizedBlogStaticPage("zh-Hans", loadPage);
