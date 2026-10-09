import { withSpanishPilot } from "../../../lib/i18n/pilot";
export { default } from "../../auth/signup";
export const getServerSideProps = withSpanishPilot();
