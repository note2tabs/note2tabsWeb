import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../piano-sheet-music-editor";
export const getServerSideProps = withLocalizedPilot("fr");
