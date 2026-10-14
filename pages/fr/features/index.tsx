import { withFrenchPilot } from "../../../lib/i18n/pilot";
export { default } from "../../features/index";
export const getServerSideProps = withFrenchPilot();
