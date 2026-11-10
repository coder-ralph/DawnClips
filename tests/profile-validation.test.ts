import assert from "node:assert/strict";
import test from "node:test";
import { generateUsername, usernameError } from "../lib/username";
import { profileUpdateSchema } from "../lib/validations/profile";

test("rejects reserved and malformed usernames", () => {
  assert.equal(usernameError("ab"), "Use 3–20 lowercase letters, numbers, or underscores.");
  assert.equal(usernameError("DawnClips"), "That username is reserved.");
  assert.equal(usernameError("player_one"), null);
});

test("generated usernames pass validation", () => {
  for (let i = 0; i < 20; i += 1) {
    const username = generateUsername("Ralph Rosael");
    assert.equal(usernameError(username), null);
  }
});

test("profile update validates IDs and no longer accepts an avatar URL", () => {
  const bad = profileUpdateSchema.safeParse({
    displayName: "Ralph",
    username: "ralph",
    bio: "",
    roleId: "abc",
    zoneId: "",
    country: "PH",
  });
  assert.equal(bad.success, false);

  const good = profileUpdateSchema.safeParse({
    displayName: "Ralph",
    username: "ralph",
    bio: "Mid lane.",
    avatarUrl: "javascript:alert(1)",
    roleId: "123456",
    zoneId: "1234",
    country: "PH",
  });
  assert.equal(good.success, true);
  // Unknown keys are stripped, so a spoofed avatar URL can never reach the update.
  assert.equal("avatarUrl" in (good.success ? good.data : {}), false);
});
