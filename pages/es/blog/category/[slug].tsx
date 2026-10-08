import { withSpanishBlogStaticPage } from "../../../../lib/i18n/blog/localize";
export { default } from "../../../blog/category/[slug]";
import { getStaticProps as loadPage } from "../../../blog/category/[slug]";
export const getServerSideProps = withSpanishBlogStaticPage(loadPage);
