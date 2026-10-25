import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../drum-notation-editor";
export const getServerSideProps = withLocalizedPilot("it");
