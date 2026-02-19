import { z } from "zod";

const isValidCanonical = (value: string) => {
  if (!value) return true;
  if (value.startsWith("/")) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
};

export const postInputSchema = z.object({
  title: z.string().min(3),
  slug: z.string().optional(),
  excerpt: z.string().min(1),
  content: z.string().min(1),
  coverImageUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["DRAFT", "SCHEDULED", "PUBLISHED"]),
  publishAt: z.string().datetime().optional().nullable(),
  seoTitle: z.string().optional().or(z.literal("")),
  seoDescription: z.string().optional().or(z.literal("")),
  canonicalUrl: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => isValidCanonical(value || ""), {
      message: "Canonical URL must be absolute or begin with /",
    }),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  clusters: z
    .array(
      z.object({
        id: z.string(),
        isPillar: z.boolean().optional(),
      })
    )
    .optional(),
});

export const taxonomyInputSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional().or(z.literal("")),
});
