import { withLocalizedStaticPage } from "../../lib/i18n/pilot";
export { default } from "../index";
import { getStaticProps as load } from "../index";
export const getServerSideProps = withLocalizedStaticPage("es", load);
