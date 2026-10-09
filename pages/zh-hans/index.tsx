import { withLocalizedPilot } from "../../lib/i18n/pilot";
export { default } from "../index";
import { getStaticProps as load } from "../index";
export const getServerSideProps = withLocalizedPilot("zh-Hans", async () => {
  const result = await load({});
  if ("props" in result) return { props: await result.props };
  return { notFound: true };
});
