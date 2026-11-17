import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { conflictKind, provisionProfile, type InsertError } from "../lib/profile-provision";
import { generateUsername, usernameError } from "../lib/username";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const clerkClash: InsertError = { code: "23505", message: 'duplicate key value violates unique constraint "profiles_clerk_user_id_key"' };
const nameClash: InsertError = { code: "23505", message: 'duplicate key value violates unique constraint "profiles_username_key"' };
type Row = { id: string; username: string };
const row: Row = { id: "p1", username: "samalaxy85o9" };

function names(...values: string[]) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

test("usernames always have a full random suffix and pass validation", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i += 1) {
    const username = generateUsername("Samalaxy");
    assert.equal(usernameError(username), null);
    assert.match(username, /^samalaxy[a-z0-9]{5}$/);
    seen.add(username);
  }
  assert.ok(seen.size > 495, "suffixes are effectively unique");
  assert.match(generateUsername("李小龙"), /^player[a-z0-9]{5}$/);
  assert.doesNotMatch(strip(read("lib/username.ts")), /Math\.random/);
});

test("the constraint behind a unique violation is told apart", () => {
  assert.equal(conflictKind(clerkClash), "identity");
  assert.equal(conflictKind(nameClash), "username");
  assert.equal(conflictKind({ code: "23505", message: "duplicate", details: "Key (username)=(x) already exists." }), "username");
  assert.equal(conflictKind({ code: "23505", message: "duplicate" }), "unknown");
});

test("a new account gets its profile on the first insert", async () => {
  const result = await provisionProfile<Row>({
    nextUsername: names("a"),
    insert: async () => ({ data: row, error: null }),
    readOwn: async () => assert.fail("no read needed"),
    readAny: async () => assert.fail("no read needed"),
  });
  assert.deepEqual(result, { status: "ready", row });
});

test("losing the sign-up race returns the profile the other request created", async () => {
  // The bug: a clash on clerk_user_id was retried with new usernames until "Could not create a unique username".
  let inserts = 0;
  const result = await provisionProfile<Row>({
    nextUsername: names("a", "b"),
    insert: async () => ({ data: null, error: (inserts += 1, clerkClash) }),
    readOwn: async () => row,
    readAny: async () => assert.fail("own read was enough"),
  });
  assert.deepEqual(result, { status: "ready", row });
  assert.equal(inserts, 1);
});

test("a profile the person's session cannot see yet is read back with the server's read", async () => {
  const result = await provisionProfile<Row>({
    nextUsername: names("a"),
    insert: async () => ({ data: null, error: clerkClash }),
    readOwn: async () => null,
    readAny: async () => row,
  });
  assert.deepEqual(result, { status: "ready", row });
});

test("an existing but unreadable profile stops at once instead of looping through usernames", async () => {
  let inserts = 0;
  const result = await provisionProfile<Row>({
    nextUsername: names("a"),
    insert: async () => ({ data: null, error: (inserts += 1, clerkClash) }),
    readOwn: async () => null,
    readAny: async () => null,
  });
  assert.equal(result.status, "unreadable");
  assert.equal(inserts, 1);
});

test("only a username clash is retried, with a new username each time", async () => {
  const tried: string[] = [];
  const result = await provisionProfile<Row>({
    nextUsername: names("one", "two", "three"),
    insert: async (username) => {
      tried.push(username);
      return username === "three" ? { data: row, error: null } : { data: null, error: nameClash };
    },
    readOwn: async () => null,
    readAny: async () => null,
  });
  assert.deepEqual(result, { status: "ready", row });
  assert.deepEqual(tried, ["one", "two", "three"]);

  const exhausted = await provisionProfile<Row>({
    nextUsername: names("x"),
    insert: async () => ({ data: null, error: nameClash }),
    readOwn: async () => null,
    readAny: async () => null,
    maxAttempts: 3,
  });
  assert.deepEqual(exhausted, { status: "username_taken" });
});

test("any other database error is reported, not retried", async () => {
  let inserts = 0;
  const error = { code: "42501", message: "permission denied" };
  const result = await provisionProfile<Row>({
    nextUsername: names("a"),
    insert: async () => ({ data: null, error: (inserts += 1, error) }),
    readOwn: async () => assert.fail("no read"),
    readAny: async () => assert.fail("no read"),
  });
  assert.deepEqual(result, { status: "failed", error });
  assert.equal(inserts, 1);
});

test("a deleted account's lingering session is treated as signed out, not as a server error", () => {
  const source = strip(read("lib/profile.ts"));
  assert.match(source, /isClerkAPIResponseError\(error\) && error\.status === 404\) return null/);
  assert.match(source, /if \(!user\) return \{ status: "signed_out" \}/);
  // Other Clerk failures are never mistaken for a missing account.
  assert.match(source, /Could not load your account\. Try again\./);
  // The server read is limited to the verified session's own account.
  assert.match(source, /admin\.from\("profiles"\)\.select\(ownProfileColumns\)\.eq\("clerk_user_id", userId\)/);

  const settings = strip(read("app/(main)/settings/page.tsx"));
  assert.doesNotMatch(settings, /\bcurrentUser\(/);
  assert.match(settings, /currentClerkUser\(\)\.catch\(\(\) => null\)/);
  assert.match(settings, /if \(sync\.status === "signed_out"\) redirect\("\/account-deleted"\)/);
});

test("the delete button survives a failed sign-out and a failed request", () => {
  const source = strip(read("components/settings/delete-account.tsx"));
  assert.match(source, /try \{\s*response = await fetch\("\/api\/user\/delete"/);
  assert.match(source, /Could not reach the server/);
  assert.match(source, /try \{\s*await signOut\(\{ redirectUrl: "\/account-deleted" \}\);\s*\} catch \{\s*window\.location\.href = new URL\("\/account-deleted", window\.location\.origin\)\.href;/);
  // Deletion itself is unchanged: confirmation, rate limit and the ordered cleanup stay in the route and lib.
  const route = strip(read("app/api/user/delete/route.ts"));
  assert.match(route, /confirmedDeletion\(body\?\.confirmation\)/);
  assert.match(route, /consume_rate_limit/);
  assert.match(route, /deleteAccount\(userId\)/);
});
