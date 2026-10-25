import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../drum-transcription";
export const getServerSideProps = withLocalizedPilot("it");
