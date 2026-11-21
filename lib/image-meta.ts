import type { ImageMime } from "@/lib/media";

/**
 * Reads the type and pixel size of a JPEG, PNG or WebP from the first bytes of the file itself, ignoring the
 * Content-Type header and the file name. Returns null for anything else (GIF, SVG, HTML, a renamed video...).
 *
 * `complete` is false when the bytes ran out before the size could be read (a JPEG whose size marker lies past the
 * prefix): the caller may fetch a longer prefix and try again.
 */
export type ImageInfo = { mime: ImageMime; width: number; height: number };
export type ImageRead = { info: ImageInfo | null; complete: boolean };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));

function readPng(bytes: Uint8Array): ImageRead {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 8 || signature.some((value, index) => bytes[index] !== value)) return { info: null, complete: true };
  // The first chunk must be IHDR: 4 length, "IHDR", width, height.
  if (bytes.length < 24) return { info: null, complete: false };
  if (ascii(bytes, 12, 4) !== "IHDR") return { info: null, complete: true };
  return { info: { mime: "image/png", width: u32be(bytes, 16), height: u32be(bytes, 20) }, complete: true };
}

function readJpeg(bytes: Uint8Array): ImageRead {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return { info: null, complete: true };
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return { info: null, complete: true };
    let marker = bytes[i + 1];
    // Fill bytes: any number of 0xFF may precede a marker.
    while (marker === 0xff && i + 2 < bytes.length) {
      i += 1;
      marker = bytes[i + 1];
    }
    if (marker === 0xd9 || marker === 0xda) return { info: null, complete: true }; // end of image / start of scan before any size
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    const length = u16be(bytes, i + 2);
    if (length < 2) return { info: null, complete: true };
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      if (i + 9 > bytes.length) return { info: null, complete: false };
      return { info: { mime: "image/jpeg", height: u16be(bytes, i + 5), width: u16be(bytes, i + 7) }, complete: true };
    }
    i += 2 + length;
  }
  return { info: null, complete: false };
}

function readWebp(bytes: Uint8Array): ImageRead {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return { info: null, complete: true };
  if (bytes.length < 30) return { info: null, complete: false };
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8 ") {
    // Lossy: frame tag (3 bytes), start code 9d 01 2a, then 14-bit width and height.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return { info: null, complete: true };
    return { info: { mime: "image/webp", width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff }, complete: true };
  }
  if (chunk === "VP8L") {
    // Lossless: signature 0x2f, then 14-bit (width - 1) and (height - 1).
    if (bytes[20] !== 0x2f) return { info: null, complete: true };
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return { info: { mime: "image/webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }, complete: true };
  }
  if (chunk === "VP8X") {
    // Extended: 24-bit (canvas width - 1) and (canvas height - 1).
    return { info: { mime: "image/webp", width: u24le(bytes, 24) + 1, height: u24le(bytes, 27) + 1 }, complete: true };
  }
  return { info: null, complete: true };
}

export function readImageInfo(bytes: Uint8Array): ImageRead {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return readJpeg(bytes);
  if (bytes.length >= 1 && bytes[0] === 0x89) return readPng(bytes);
  if (bytes.length >= 4 && ascii(bytes, 0, 4) === "RIFF") return readWebp(bytes);
  return { info: null, complete: bytes.length >= 12 };
}
