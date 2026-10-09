import { withJapanesePilot } from "../../../../lib/i18n/pilot";
export { default } from "../../../tabs/[id]/edit";
import { getServerSideProps as loadPage } from "../../../tabs/[id]/edit";
export const getServerSideProps = withJapanesePilot(loadPage);
