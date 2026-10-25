import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../piano-transcription";
export const getServerSideProps = withLocalizedPilot("es");
