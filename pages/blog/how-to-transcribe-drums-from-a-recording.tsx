export { default } from "./[slug]";
import { instrumentGuideProps } from "../../lib/instrumentGuides";
export const getStaticProps = () => instrumentGuideProps("how-to-transcribe-drums-from-a-recording");
