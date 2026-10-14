import { withItalianPilot } from "../../lib/i18n/pilot";
export { default } from "../history";
import { getServerSideProps as loadPage } from "../history";
export const getServerSideProps = withItalianPilot(loadPage);
