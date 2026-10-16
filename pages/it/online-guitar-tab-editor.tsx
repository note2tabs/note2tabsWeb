import { withItalianPilot } from "../../lib/i18n/pilot";
export { default } from "../online-guitar-tab-editor";
export const getServerSideProps = withItalianPilot();
