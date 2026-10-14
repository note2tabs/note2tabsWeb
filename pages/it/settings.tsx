import { withItalianPilot } from "../../lib/i18n/pilot";
export { default } from "../settings";
import { getServerSideProps as loadPage } from "../settings";
export const getServerSideProps = withItalianPilot(loadPage);
