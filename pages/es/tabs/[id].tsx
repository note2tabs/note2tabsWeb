import { withSpanishPilot } from "../../../lib/i18n/pilot";
export { default } from "../../tabs/[id]";
import { getServerSideProps as loadPage } from "../../tabs/[id]";
export const getServerSideProps = withSpanishPilot(loadPage);
