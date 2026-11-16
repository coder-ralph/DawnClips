/**
 * "Fast start" for MP4 uploads.
 *
 * Phone recorders, screen recorders and many editors write the `moov` box (the index a player needs before it can
 * show a single frame) at the END of the file. The browser then has to fetch the tail first, which is an extra
 * round trip to storage on every first play, and a playback start that waits for it. This moves `moov` in front of
 * the media data (`mdat`) and fixes the chunk offsets inside it, the same thing `ffmpeg -movflags +faststart` does.
 *
 * The file size does not change and the media bytes are not copied (the result is a Blob made of slices of the
 * original), so it is safe for 100 MB uploads. Anything unexpected (fragmented MP4, 64-bit overflow, truncated
 * boxes, a huge `moov`) returns the original file untouched, so an upload is never made worse.
 */

type Box = { type: string; start: number; size: number; header: number };

const maxMoovBytes = 32 * 1024 * 1024;
const maxBoxes = 4096;
/** Boxes that only contain other boxes, on the path to the chunk offset tables. */
const containers = new Set(["moov", "trak", "mdia", "minf", "stbl"]);

const fourcc = (view: DataView, offset: number) =>
  String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));

async function readBytes(file: Blob, start: number, length: number) {
  return new DataView(await file.slice(start, start + length).arrayBuffer());
}

/** The top-level boxes of the file, or null if the structure is not a plain, complete MP4. */
async function topLevelBoxes(file: Blob): Promise<Box[] | null> {
  const boxes: Box[] = [];
  let offset = 0;
  while (offset < file.size) {
    if (boxes.length >= maxBoxes || file.size - offset < 8) return null;
    const view = await readBytes(file, offset, 16);
    let size = view.getUint32(0);
    let header = 8;
    if (size === 1) {
      if (view.byteLength < 16) return null;
      const large = view.getBigUint64(8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(large);
      header = 16;
    } else if (size === 0) {
      size = file.size - offset;
    }
    if (size < header || offset + size > file.size) return null;
    boxes.push({ type: fourcc(view, 4), start: offset, size, header });
    offset += size;
  }
  return boxes;
}

/** Adds `delta` to every chunk offset that points into [from, to). Returns false if a value cannot be patched. */
function patchOffsets(moov: DataView, from: number, to: number, delta: number): boolean {
  const shift = (value: number) => (value >= from && value < to ? value + delta : value);

  function walk(start: number, end: number): boolean {
    let at = start;
    while (at + 8 <= end) {
      let size = moov.getUint32(at);
      const type = fourcc(moov, at + 4);
      let header = 8;
      if (size === 1) {
        if (at + 16 > end) return false;
        const large = moov.getBigUint64(at + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) return false;
        size = Number(large);
        header = 16;
      } else if (size === 0) {
        size = end - at;
      }
      if (size < header || at + size > end) return false;
      const bodyStart = at + header;
      const bodyEnd = at + size;

      if (containers.has(type)) {
        if (!walk(bodyStart, bodyEnd)) return false;
      } else if (type === "stco" || type === "co64") {
        const entrySize = type === "stco" ? 4 : 8;
        if (bodyStart + 8 > bodyEnd) return false;
        const count = moov.getUint32(bodyStart + 4);
        if (bodyStart + 8 + count * entrySize > bodyEnd) return false;
        for (let index = 0; index < count; index += 1) {
          const position = bodyStart + 8 + index * entrySize;
          if (type === "stco") {
            const next = shift(moov.getUint32(position));
            if (next > 0xffffffff) return false;
            moov.setUint32(position, next);
          } else {
            const current = moov.getBigUint64(position);
            if (current > BigInt(Number.MAX_SAFE_INTEGER)) return false;
            moov.setBigUint64(position, BigInt(shift(Number(current))));
          }
        }
      }
      at += size;
    }
    return at === end;
  }

  return walk(0, moov.byteLength);
}

/** Returns a copy of the MP4 with `moov` before `mdat`, or the same file if it already is, or cannot be changed. */
export async function optimizeForStreaming(file: File): Promise<File> {
  try {
    const boxes = await topLevelBoxes(file);
    if (!boxes) return file;
    const moovIndex = boxes.findIndex((box) => box.type === "moov");
    const mdatIndex = boxes.findIndex((box) => box.type === "mdat");
    if (moovIndex < 0 || mdatIndex < 0 || moovIndex < mdatIndex) return file;
    if (boxes.filter((box) => box.type === "moov").length !== 1) return file;
    if (boxes.some((box) => box.type === "moof")) return file;

    const moov = boxes[moovIndex];
    const firstMdat = boxes[mdatIndex];
    if (moov.size > maxMoovBytes) return file;

    const bytes = await file.slice(moov.start, moov.start + moov.size).arrayBuffer();
    // Media data between the old and the new position of moov moves back by exactly the size of moov.
    // After the move: [... before mdat][moov][mdat ... up to the old moov][everything after the old moov].
    if (!patchOffsets(new DataView(bytes, moov.header), firstMdat.start, moov.start, moov.size)) return file;

    const result = new File(
      [
        file.slice(0, firstMdat.start),
        bytes,
        file.slice(firstMdat.start, moov.start),
        file.slice(moov.start + moov.size),
      ],
      file.name,
      { type: file.type || "video/mp4", lastModified: file.lastModified },
    );
    if (result.size !== file.size) return file;

    const check = await topLevelBoxes(result);
    const newMoov = check?.findIndex((box) => box.type === "moov") ?? -1;
    const newMdat = check?.findIndex((box) => box.type === "mdat") ?? -1;
    return check && newMoov >= 0 && newMoov < newMdat ? result : file;
  } catch {
    return file;
  }
}
