import { withJapaneseStaticPage } from "../../../lib/i18n/pilot";
export { default } from "../../features/[slug]";
import { getStaticProps as loadPage } from "../../features/[slug]";
export const getServerSideProps = withJapaneseStaticPage(loadPage);
