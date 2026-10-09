import { withLocalizedPilot } from "../../../lib/i18n/pilot";
export { default } from "../../auth/login";
export const getServerSideProps = withLocalizedPilot("pl");
