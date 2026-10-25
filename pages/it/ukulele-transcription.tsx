import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../ukulele-transcription";
export const getServerSideProps = withLocalizedPilot("it");
