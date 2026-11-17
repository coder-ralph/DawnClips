import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { issueReceipt, receiptMaxAgeSeconds, verifyReceipt } from "../lib/deletion-receipt";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const secret = "sk_test_secret";
const now = 1_800_000_000_000;

test("a fresh receipt verifies", async () => {
  assert.equal(await verifyReceipt(secret, await issueReceipt(secret, now), now + 1000), true);
});

test("a missing, malformed, forged, expired or foreign receipt is rejected", async () => {
  const good = await issueReceipt(secret, now);
  const [expires, signature] = good.split(".");
  assert.equal(await verifyReceipt(secret, undefined, now), false);
  assert.equal(await verifyReceipt(secret, "", now), false);
  assert.equal(await verifyReceipt(secret, "1", now), false);
  assert.equal(await verifyReceipt(secret, "abc.def", now), false);
  assert.equal(await verifyReceipt(secret, `${good}.extra`, now), false);
  // Made up in the browser: right shape, wrong signature.
  assert.equal(await verifyReceipt(secret, `${expires}.${"0".repeat(signature.length)}`, now), false);
  // Signed with another secret.
  assert.equal(await verifyReceipt("other", good, now), false);
  // No server secret configured: nothing can be proven.
  assert.equal(await verifyReceipt(undefined, good, now), false);
  // Expired.
  assert.equal(await verifyReceipt(secret, good, now + receiptMaxAgeSeconds * 1000 + 1), false);
  // Extending the expiry invalidates the signature; a far-future one is refused outright.
  assert.equal(await verifyReceipt(secret, `${Number(expires) + 60_000}.${signature}`, now), false);
  const far = await issueReceipt(secret, now + 3_600_000);
  assert.equal(await verifyReceipt(secret, far, now), false);
});

test("the delete route issues the receipt only after the deletion succeeded", () => {
  const source = strip(read("app/api/user/delete/route.ts"));
  const failed = source.indexOf("if (!result.ok) return");
  const issued = source.indexOf("issueReceipt(");
  assert.ok(failed > 0 && issued > failed, "the cookie is set after the failure return");
  assert.match(source, /httpOnly: true/);
  assert.match(source, /sameSite: "lax"/);
  assert.match(source, /maxAge: receiptMaxAgeSeconds/);
  // The protections are unchanged.
  assert.match(source, /Unauthorized/);
  assert.match(source, /confirmedDeletion\(body\?\.confirmation\)/);
  assert.match(source, /consume_rate_limit/);
});

test("the confirmation page is public, branded, and only shown after a deletion", () => {
  const source = strip(read("app/account-deleted/page.tsx"));
  assert.match(source, /Your DawnClips account has been successfully deleted\./);
  assert.match(source, /Your account and associated data have been removed\./);
  assert.match(source, /Back to Home/);
  assert.match(source, /href="\/"/);
  assert.match(source, /<Logo/);
  assert.match(source, /verifyReceipt\(process\.env\.CLERK_SECRET_KEY, receipt\)\)\) redirect\("\/"\)/);
  assert.match(source, /index: false/);
  // No sign-in requirement.
  assert.doesNotMatch(source, /auth\.protect|currentUser|ensureCurrentProfile|useAuth/);
  // It sits outside the signed-in app shell, so a leftover session cannot break it.
  assert.ok(!read("app/account-deleted/page.tsx").includes("(main)"));
});

test("after deletion the person lands on the confirmation page, from the button and from a lingering settings page", () => {
  const button = strip(read("components/settings/delete-account.tsx"));
  assert.match(button, /signOut\(\{ redirectUrl: "\/account-deleted" \}\)/);
  assert.match(button, /new URL\("\/account-deleted", window\.location\.origin\)/);
  assert.match(strip(read("app/(main)/settings/page.tsx")), /redirect\("\/account-deleted"\)/);
});

test("new accounts land on /profile after sign-up, from the sign-up form and from a sign-in that creates one", () => {
  const source = strip(read("components/auth/auth-screen.tsx"));
  assert.match(source, /<SignUp [^>]*fallbackRedirectUrl="\/profile"/);
  assert.match(source, /<SignIn [^>]*fallbackRedirectUrl="\/" signUpFallbackRedirectUrl="\/profile"/);
});

test("/profile creates the profile first and redirects only when it is ready", () => {
  const source = strip(read("app/(main)/profile/page.tsx"));
  const ensure = source.indexOf("await ensureCurrentProfile()");
  const redirectReady = source.indexOf('if (sync.status === "ready") redirect(`/profile/${sync.profile.username}`)');
  assert.ok(source.indexOf("await auth.protect()") >= 0 && ensure > 0 && redirectReady > ensure);
  // Anything other than ready shows a message (with a retry for an error) instead of redirecting to a missing profile.
  assert.match(source, /Try again/);
  assert.match(source, /pending deletion/);
});
