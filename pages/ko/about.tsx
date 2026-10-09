import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../about";
export const getServerSideProps = withLocalizedPilot("ko");
