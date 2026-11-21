import { z } from "zod";
import { CLIP_TEXT_MAX } from "@/lib/clip-text";
import {
  COMMENT_IMAGE_MAX_BYTES,
  PHOTO_MAX_BYTES,
  PHOTO_POST_MAX_IMAGES,
  PHOTO_POST_MAX_TOTAL_BYTES,
  dimensionsInRange,
  imageMimeTypes,
} from "@/lib/media";
import { clipVisibility, heroTags } from "@/lib/validations/clip";

const mime = z.enum(imageMimeTypes, { message: "Only JPEG, PNG and WebP images are accepted." });
const pixels = z.number().int().min(1).max(16_384);

const photoFile = z
  .object({
    mimeType: mime,
    size: z.number().int().positive().max(PHOTO_MAX_BYTES, "Each photo must be 100 MB or smaller."),
    width: pixels,
    height: pixels,
  })
  .refine((file) => dimensionsInRange(file.width, file.height), "One of the photos is too large to display.");

/** What the browser declares before it uploads. The server checks every value again against the bytes it receives. */
export const postInitiateSchema = z
  .object({
    caption: z.string().max(CLIP_TEXT_MAX, "Keep the caption under 1000 characters.").default(""),
    heroTags: heroTags.default([]),
    visibility: clipVisibility.default("public"),
    files: z
      .array(photoFile)
      .min(1, "Add at least one photo.")
      .max(PHOTO_POST_MAX_IMAGES, `A post can have up to ${PHOTO_POST_MAX_IMAGES} photos.`),
  })
  .refine(
    (value) => value.files.reduce((total, file) => total + file.size, 0) <= PHOTO_POST_MAX_TOTAL_BYTES,
    `The photos in one post can total up to ${Math.round(PHOTO_POST_MAX_TOTAL_BYTES / 1_048_576)} MB.`,
  );

export const postUploadCompleteSchema = z.object({ postId: z.string().uuid() });
export const postUploadCancelSchema = z.object({ postId: z.string().uuid() });

export const commentImageInitiateSchema = z
  .object({
    mimeType: mime,
    size: z.number().int().positive().max(COMMENT_IMAGE_MAX_BYTES, "The image must be 5 MB or smaller."),
    width: pixels,
    height: pixels,
  })
  .refine((file) => dimensionsInRange(file.width, file.height), "That image is too large to display.");
