import { withSpanishPilot } from "../../../lib/i18n/pilot";
import { getServerSideProps as loadPage } from "../../blog/rss.xml";
export {default} from "../../blog/rss.xml";
export const getServerSideProps = withSpanishPilot(loadPage);
