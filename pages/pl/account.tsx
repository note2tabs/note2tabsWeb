import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../account";
import { getServerSideProps as loadPage } from "../account";
export const getServerSideProps = withLocalizedPilot("pl", loadPage);
