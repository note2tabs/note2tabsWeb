import type { NextApiResponse } from "next";
import { Prisma } from "@prisma/client";

const MIGRATION_HINT =
  "Blog tables are missing in this database. Run `npx prisma migrate deploy` on this environment.";

const hasMissingRelationMessage = (message: string) =>
  /relation .* does not exist/i.test(message) || /table .* does not exist/i.test(message);

export const getBlogApiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2021" || error.code === "P2022") {
      return MIGRATION_HINT;
    }
  }
  if (error instanceof Error && hasMissingRelationMessage(error.message)) {
    return MIGRATION_HINT;
  }
  return fallback;
};

export const sendBlogApiError = (
  res: NextApiResponse,
  error: unknown,
  fallback: string
) => {
  if (process.env.NODE_ENV !== "production") {
    console.error("[admin-blog-api]", error);
  }
  return res.status(500).json({ error: getBlogApiErrorMessage(error, fallback) });
};

