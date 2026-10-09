import { withJapanesePilot } from "../../../lib/i18n/pilot";
export { default } from "../../auth/login";
export const getServerSideProps = withJapanesePilot();
