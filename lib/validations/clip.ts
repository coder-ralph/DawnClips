import { z } from "zod";
import { isValidTag } from "@/lib/heroes";
import { maxClipBytes } from "@/lib/video";

export const clipVisibility = z.enum(["public", "unlisted", "private"]);
export const feedName = z.enum(["foryou", "following", "trending", "latest"]);

const heroTags = z
  .array(z.string())
  .max(5, "Add up to 5 tags.")
  .refine((tags) => new Set(tags).size === tags.length, "Tags must be unique.")
  .refine((tags) => tags.every((tag) => isValidTag(tag)), "Tags can use letters, numbers and dashes (up to 40 characters).");

export const uploadInitiateSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(120),
  description: z.string().trim().max(2000).default(""),
  heroTags,
  visibility: clipVisibility.default("public"),
  fileSize: z.number().int().positive().max(maxClipBytes(), "Video must be 100 MB or smaller."),
  mimeType: z.literal("video/mp4", { message: "Only MP4 videos are accepted." }),
  fileName: z.string().trim().max(200),
  posterSize: z.number().int().positive().max(2_000_000).optional(),
});

export const uploadCompleteSchema = z.object({
  clipId: z.string().uuid(),
  posterUploaded: z.boolean().default(false),
});

export const uploadCancelSchema = z.object({
  clipId: z.string().uuid(),
});

export const reportSchema = z.object({
  targetId: z.string().uuid(),
  targetType: z.enum(["clip", "comment", "profile"]),
  reason: z.enum(["spam", "harassment", "hate", "violence", "sexual", "copyright", "other"]),
  description: z.string().trim().max(1000).default(""),
});

export const feedQuerySchema = z.object({
  feed: feedName.default("foryou"),
  cursor: z.string().max(500).optional(),
});

export const clipEditSchema = z.object({
  title: z.string().trim().min(1, "Write something about the clip.").max(120, "The first line can be up to 120 characters."),
  description: z.string().trim().max(2000, "Keep the details under 2000 characters.").default(""),
  heroTags,
});

export const momentsSchema = z.object({
  moments: z
    .array(
      z.object({
        at: z.number().int().min(0).max(86_400),
        label: z.string().trim().min(1).max(24),
      }),
    )
    .max(8, "Add up to 8 moments."),
});

export const watchSchema = z.object({
  seconds: z.number().int().min(1).max(21_600),
});
