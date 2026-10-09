import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../mp3-to-guitar-tabs";
export const getServerSideProps = withLocalizedPilot("zh-Hans");
