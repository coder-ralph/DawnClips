import { z } from "zod";

export const desiredStateSchema = z.object({
  desired: z.boolean(),
});

export const commentBodySchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty.").max(500, "Comment must be 500 characters or fewer."),
  parentId: z.string().uuid().nullable().optional(),
});

export const commentEditSchema = z.object({
  content: z.string().trim().min(1, "Comment cannot be empty.").max(500, "Comment must be 500 characters or fewer."),
});
