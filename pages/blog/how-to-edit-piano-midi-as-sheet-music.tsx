export { default } from "./[slug]";
import { instrumentGuideProps } from "../../lib/instrumentGuides";
export const getStaticProps = () => instrumentGuideProps("how-to-edit-piano-midi-as-sheet-music");
