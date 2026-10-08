import { withSpanishPilot } from "../../lib/i18n/pilot";
export { default } from "../history";
import { getServerSideProps as loadPage } from "../history";
export const getServerSideProps = withSpanishPilot(loadPage);
