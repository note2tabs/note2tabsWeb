import { withPortugueseBlogStaticPage } from "../../../../lib/i18n/blog/localize";
export { default } from "../../../blog/cluster/[slug]";
import { getStaticProps as loadPage } from "../../../blog/cluster/[slug]";
export const getServerSideProps = withPortugueseBlogStaticPage(loadPage);
