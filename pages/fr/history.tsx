import { withFrenchPilot } from "../../lib/i18n/pilot";
export { default } from "../history";
import { getServerSideProps as loadPage } from "../history";
export const getServerSideProps = withFrenchPilot(loadPage);
