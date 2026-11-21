import { z } from "zod";

export const desiredStateSchema = z.object({
  desired: z.boolean(),
});

export const commentBodySchema = z
  .object({
    content: z.string().trim().max(500, "Comment must be 500 characters or fewer.").default(""),
    parentId: z.string().uuid().nullable().optional(),
    /** An image uploaded for this comment (POST /api/comments/media/initiate). A comment needs text, an image, or both. */
    mediaId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => value.content.length > 0 || Boolean(value.mediaId), { message: "Comment cannot be empty.", path: ["content"] });

export const commentEditSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty.").max(500, "Comment must be 500 characters or fewer."),
});
