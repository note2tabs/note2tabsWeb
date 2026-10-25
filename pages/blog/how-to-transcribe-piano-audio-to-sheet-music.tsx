export { default } from "./[slug]";
import { instrumentGuideProps } from "../../lib/instrumentGuides";
export const getStaticProps = () => instrumentGuideProps("how-to-transcribe-piano-audio-to-sheet-music");
