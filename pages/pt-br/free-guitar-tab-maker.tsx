import { withPortuguesePilot } from "../../lib/i18n/pilot";
export { default } from "../free-guitar-tab-maker";
export const getServerSideProps = withPortuguesePilot();
