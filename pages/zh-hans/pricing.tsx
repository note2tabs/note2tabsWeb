import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../pricing";
export const getServerSideProps = withLocalizedPilot("zh-Hans");
