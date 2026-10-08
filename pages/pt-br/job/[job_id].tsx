import { withPortuguesePilot } from "../../../lib/i18n/pilot";
export { default } from "../../job/[job_id]";
export const getServerSideProps = withPortuguesePilot();
