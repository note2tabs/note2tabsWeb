import { withLocalizedPilot } from "../../../lib/i18n/pilot";
import { getServerSideProps as loadPage } from "../../blog/rss.xml";
export {default} from "../../blog/rss.xml";
export const getServerSideProps = withLocalizedPilot("zh-Hans", loadPage);
