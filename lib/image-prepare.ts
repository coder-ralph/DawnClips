import { readImageInfo } from "@/lib/image-meta";
import { checkImageFile, dimensionsInRange, type ImageMime } from "@/lib/media";

/**
 * Browser-side preparation of an image before it is uploaded: it checks the real file type (the first bytes, not the
 * name), reads the pixel size, and shrinks large images so a phone photo does not travel as 12 MB when 1-3 MB looks the
 * same on screen. The 100 MB / 5 MB limits stay the absolute ceilings; the server checks everything again.
 */
export type PrepareOptions = {
  /** What the finished file may weigh at most (100 MB for a photo post, 5 MB for a comment image). */
  maxBytes: number;
  /** The most a file may weigh before it is picked at all (a comment image may start larger and be shrunk to maxBytes). */
  pickBytes: number;
  /** Longest side to keep when an image is re-encoded. */
  maxSide: number;
  /** Files at or under this size and under maxSide are uploaded as they are. */
  keepUnderBytes: number;
};

export const photoPrepare: PrepareOptions = {
  maxBytes: 104_857_600,
  pickBytes: 104_857_600,
  maxSide: 2560,
  keepUnderBytes: 1_572_864,
};

export const commentImagePrepare: PrepareOptions = {
  maxBytes: 5_242_880,
  pickBytes: 104_857_600,
  maxSide: 2560,
  keepUnderBytes: 5_242_880,
};

export type PreparedImage = { file: File; mime: ImageMime; width: number; height: number; recompressed: boolean };
export type PrepareResult = { ok: true; image: PreparedImage } | { ok: false; error: string };

/** Pure decision: should this image be re-encoded, and to what size? */
export function planImagePrep(input: { size: number; width: number; height: number; animated: boolean }, options: PrepareOptions) {
  const longSide = Math.max(input.width, input.height);
  const tooBig = input.size > options.maxBytes;
  // An animated image would lose its frames if redrawn on a canvas, so it is only ever kept as it is.
  if (input.animated) return { recompress: false as const, tooBig, width: input.width, height: input.height };
  const needs = input.size > options.keepUnderBytes || longSide > options.maxSide || tooBig;
  if (!needs) return { recompress: false as const, tooBig, width: input.width, height: input.height };
  const scale = longSide > options.maxSide ? options.maxSide / longSide : 1;
  return {
    recompress: true as const,
    tooBig,
    width: Math.max(1, Math.round(input.width * scale)),
    height: Math.max(1, Math.round(input.height * scale)),
  };
}

/** True for an animated WebP (VP8X animation flag) or APNG (an acTL chunk before the image data). */
export function isAnimatedImage(bytes: Uint8Array) {
  const ascii = (index: number, length: number) => String.fromCharCode(...bytes.slice(index, index + length));
  if (bytes.length >= 21 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP" && ascii(12, 4) === "VP8X") return (bytes[20] & 0x02) !== 0;
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 3) === "PNG") return ascii(0, Math.min(bytes.length, 4096)).includes("acTL");
  return false;
}

async function decode(file: File) {
  try {
    // "from-image" applies the EXIF turn, so the size read here is the size people will see.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

async function encode(bitmap: ImageBitmap, width: number, height: number, quality: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  // A browser that cannot write WebP returns a PNG instead; that is not smaller, so it is not used.
  return blob && blob.type === "image/webp" ? blob : null;
}

function webpName(name: string) {
  return `${name.replace(/\.[^.]+$/, "") || "image"}.webp`;
}

export async function prepareImage(file: File, options: PrepareOptions): Promise<PrepareResult> {
  const problem = checkImageFile(file, options.pickBytes);
  if (problem) return { ok: false, error: problem };

  // The type is taken from the file's own first bytes, so a renamed GIF, SVG or video is refused here (and again on the server).
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const read = readImageInfo(head);
  if (!read.info || read.info.mime !== file.type) return { ok: false, error: "That file is not a valid JPEG, PNG or WebP image." };
  if (!dimensionsInRange(read.info.width, read.info.height)) return { ok: false, error: "That image is too large to display." };

  const bitmap = await decode(file);
  const shown = bitmap ? { width: bitmap.width, height: bitmap.height } : { width: read.info.width, height: read.info.height };
  const plan = planImagePrep({ size: file.size, width: shown.width, height: shown.height, animated: isAnimatedImage(head) }, options);

  if (plan.recompress && bitmap) {
    // Try a good quality first, then a lighter one if a hard limit still needs to be met.
    for (const [quality, shrink] of [[0.86, 1], [0.72, 0.75]] as const) {
      const width = Math.max(1, Math.round(plan.width * shrink));
      const height = Math.max(1, Math.round(plan.height * shrink));
      const blob = await encode(bitmap, width, height, quality);
      if (!blob) break;
      const smaller = blob.size < file.size || plan.tooBig || Math.max(shown.width, shown.height) > options.maxSide;
      if (smaller && blob.size <= options.maxBytes) {
        bitmap.close();
        const result = new File([blob], webpName(file.name), { type: "image/webp" });
        return { ok: true, image: { file: result, mime: "image/webp", width, height, recompressed: true } };
      }
    }
  }
  bitmap?.close();

  if (file.size > options.maxBytes) {
    return { ok: false, error: `Images must be ${Math.round(options.maxBytes / 1_048_576)} MB or smaller.` };
  }
  return { ok: true, image: { file, mime: read.info.mime, width: shown.width, height: shown.height, recompressed: false } };
}
