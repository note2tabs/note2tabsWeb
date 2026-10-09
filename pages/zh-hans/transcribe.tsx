import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../transcriber";
// The shared /transcriber module also exports its legacy English redirect.
// /zh-hans/transcribe is the destination page and must render the component.
export const getServerSideProps = withLocalizedPilot("zh-Hans");
