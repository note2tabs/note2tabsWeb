import { withPortuguesePilot } from "../../lib/i18n/pilot";
export { default } from "../transcriber";
// The shared /transcriber module also exports its legacy English redirect.
// /pt-br/transcribe is the destination page and must render the component.
export const getServerSideProps = withPortuguesePilot();
