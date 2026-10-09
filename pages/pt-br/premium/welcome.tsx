import { withPortuguesePilot } from "../../../lib/i18n/pilot";
export { default } from "../../premium/welcome";
import { getServerSideProps as load } from "../../premium/welcome";
export const getServerSideProps = withPortuguesePilot(load);
