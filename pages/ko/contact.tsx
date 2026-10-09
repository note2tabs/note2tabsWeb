import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../contact";
export const getServerSideProps = withLocalizedPilot("ko");
