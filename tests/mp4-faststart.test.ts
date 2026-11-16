import assert from "node:assert/strict";
import test from "node:test";
import { optimizeForStreaming } from "../lib/mp4-faststart";

const u32 = (value: number) => Uint8Array.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);
const text = (value: string) => Uint8Array.from(value.split("").map((char) => char.charCodeAt(0)));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};
const box = (type: string, ...body: Uint8Array[]) => {
  const content = concat(...body);
  return concat(u32(8 + content.length), text(type), content);
};

/** ftyp + mdat (with a recognisable payload) + moov holding one chunk offset that points at the payload. */
function buildFile(order: "moov-last" | "moov-first") {
  const ftyp = box("ftyp", text("isom"), u32(0), text("isom"));
  const payload = text("PAYLOAD-BYTES");
  const mdat = box("mdat", payload);
  const moovFor = (offset: number) => box("moov", box("trak", box("mdia", box("minf", box("stbl", box("stco", u32(0), u32(1), u32(offset)))))));
  const payloadStart = (before: number) => before + 8;
  if (order === "moov-last") return { bytes: concat(ftyp, mdat, moovFor(payloadStart(ftyp.length))), payload };
  const moovSize = moovFor(0).length;
  return { bytes: concat(ftyp, moovFor(payloadStart(ftyp.length + moovSize)), mdat), payload };
}

function stcoOffset(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let at = 0; at + 16 < bytes.length; at += 1) {
    if (String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]) === "stco") return view.getUint32(at + 12);
  }
  throw new Error("no stco");
}

const typeOrder = (bytes: Uint8Array) => {
  const types: string[] = [];
  let at = 0;
  while (at < bytes.length) {
    const size = new DataView(bytes.buffer, bytes.byteOffset).getUint32(at);
    types.push(String.fromCharCode(...bytes.slice(at + 4, at + 8)));
    at += size;
  }
  return types;
};

test("moves moov in front of mdat and keeps chunk offsets pointing at the media bytes", async () => {
  const { bytes, payload } = buildFile("moov-last");
  const file = new File([bytes], "clip.mp4", { type: "video/mp4" });
  const result = await optimizeForStreaming(file);
  const out = new Uint8Array(await result.arrayBuffer());
  assert.notEqual(result, file);
  assert.equal(out.length, bytes.length);
  assert.deepEqual(typeOrder(out), ["ftyp", "moov", "mdat"]);
  const offset = stcoOffset(out);
  assert.equal(new TextDecoder().decode(out.slice(offset, offset + payload.length)), "PAYLOAD-BYTES");
});

test("leaves a file that already starts with moov, or is not an MP4, alone", async () => {
  const ready = new File([buildFile("moov-first").bytes], "clip.mp4", { type: "video/mp4" });
  assert.equal(await optimizeForStreaming(ready), ready);
  const junk = new File([text("this is not an mp4 file at all")], "clip.mp4", { type: "video/mp4" });
  assert.equal(await optimizeForStreaming(junk), junk);
  const truncated = new File([buildFile("moov-last").bytes.slice(0, 40)], "clip.mp4", { type: "video/mp4" });
  assert.equal(await optimizeForStreaming(truncated), truncated);
});
