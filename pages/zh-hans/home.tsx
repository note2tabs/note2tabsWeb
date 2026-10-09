import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../home";
import { getServerSideProps as loadPage } from "../home";
export const getServerSideProps = withLocalizedPilot("zh-Hans", loadPage);
