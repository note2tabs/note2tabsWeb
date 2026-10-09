import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../shared";
import { getServerSideProps as loadPage } from "../shared";
export const getServerSideProps = withLocalizedPilot("pl", loadPage);
