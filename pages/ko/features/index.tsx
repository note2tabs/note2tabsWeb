import { withLocalizedPilot } from "../../../lib/i18n/pilot";
export { default } from "../../features/index";
export const getServerSideProps = withLocalizedPilot("ko");
