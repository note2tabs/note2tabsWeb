import { withJapanesePilot } from "../../../lib/i18n/pilot";
export { default } from "../../features/index";
export const getServerSideProps = withJapanesePilot();
