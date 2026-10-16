import { withItalianPilot } from "../../lib/i18n/pilot";
export { default } from "../audio-to-guitar-tab-converter";
export const getServerSideProps = withItalianPilot();
