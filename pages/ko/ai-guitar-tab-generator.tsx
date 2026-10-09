import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../ai-guitar-tab-generator";
export const getServerSideProps = withLocalizedPilot("ko");
