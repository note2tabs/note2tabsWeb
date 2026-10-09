import { withJapanesePilot } from "../../../lib/i18n/pilot";
export { default } from "../../tabs/index";
import { getServerSideProps as loadPage } from "../../tabs/index";
export const getServerSideProps = withJapanesePilot(loadPage);
