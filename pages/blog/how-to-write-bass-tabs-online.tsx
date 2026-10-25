export { default } from "./[slug]";
import { instrumentGuideProps } from "../../lib/instrumentGuides";
export const getStaticProps = () => instrumentGuideProps("how-to-write-bass-tabs-online");
