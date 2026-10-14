import { withFrenchPilot } from "../../lib/i18n/pilot";
export { default } from "../account";
import { getServerSideProps as loadPage } from "../account";
export const getServerSideProps = withFrenchPilot(loadPage);
