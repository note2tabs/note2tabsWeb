import { withPortugueseBlogPage } from "../../../lib/i18n/blog/localize";
export { default } from "../../blog/index";
import { getServerSideProps as loadPage } from "../../blog/index";
export const getServerSideProps = withPortugueseBlogPage(loadPage);
