import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../instruments";
export const getServerSideProps = withLocalizedPilot("ar");
