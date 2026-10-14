import { withItalianPilot } from "../../lib/i18n/pilot";
export { default } from "../shared";
import { getServerSideProps as loadPage } from "../shared";
export const getServerSideProps = withItalianPilot(loadPage);
