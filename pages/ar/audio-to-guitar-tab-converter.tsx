import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../audio-to-guitar-tab-converter";
export const getServerSideProps = withLocalizedPilot("ar");
