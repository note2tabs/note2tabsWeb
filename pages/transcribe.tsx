export { default } from "./transcriber";
import type { GetServerSideProps } from "next";
import {
  creditPlacementPreview,
  creditPlacementReviewEnabled,
} from "../lib/creditPlacementPreview";
export const getServerSideProps: GetServerSideProps = async (ctx) => ({
  props:
    creditPlacementReviewEnabled() && ctx.query.creditPreview === "1"
      ? { session: creditPlacementPreview, creditPlacementReview: true }
      : {},
});
