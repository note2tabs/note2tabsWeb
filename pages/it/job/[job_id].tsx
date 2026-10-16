import { withItalianPilot } from "../../../lib/i18n/pilot";
export { default } from "../../job/[job_id]";
export const getServerSideProps = withItalianPilot();
