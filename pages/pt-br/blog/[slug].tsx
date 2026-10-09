import { withPortugueseBlogStaticPage } from "../../../lib/i18n/blog/localize";
export { default } from "../../blog/[slug]";
import { getStaticProps as loadPage } from "../../blog/[slug]";
export const getServerSideProps = withPortugueseBlogStaticPage(loadPage);
