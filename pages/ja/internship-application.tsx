import { withJapanesePilot } from "../../lib/i18n/pilot";
export { default } from "../internship-application";
export const getServerSideProps = withJapanesePilot();
