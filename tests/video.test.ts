import assert from "node:assert/strict";
import test from "node:test";
import { clipObjectKey, isMp4Signature, isOwnedObjectKey } from "../lib/video";

test("accepts an MP4 ftyp signature and rejects other bytes", () => {
  const mp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
  assert.equal(isMp4Signature(mp4), true);
  assert.equal(isMp4Signature(new Uint8Array([0, 0, 0, 24, 1, 2, 3, 4])), false);
  assert.equal(isMp4Signature(new Uint8Array([102, 116, 121, 112])), false);
});

test("object keys must belong to the uploader and use the generated shape", () => {
  const profileId = "11111111-1111-4111-8111-111111111111";
  const otherId = "22222222-2222-4222-8222-222222222222";
  const clipId = "33333333-3333-4333-8333-333333333333";
  const key = clipObjectKey(profileId, clipId, "mp4");
  assert.equal(isOwnedObjectKey(key, profileId), true);
  assert.equal(isOwnedObjectKey(key, otherId), false);
  assert.equal(isOwnedObjectKey(`../${key}`, profileId), false);
  assert.equal(isOwnedObjectKey("clips/not-a-uuid/file.mp4", profileId), false);
});
