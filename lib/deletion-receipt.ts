/**
 * Proof that an account deletion just finished in this browser. The delete route sets it as a short-lived cookie only
 * after the deletion succeeded, and the confirmation page shows itself only when the cookie is present, genuine and
 * recent, so the page cannot be opened by typing the address. The value is signed (HMAC-SHA256) with a server secret,
 * so it cannot be made up in the browser either. It carries no account data.
 */
export const receiptCookie = "dawnclips-account-deleted";
export const receiptMaxAgeSeconds = 300;

const encoder = new TextEncoder();

async function sign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function issueReceipt(secret: string, now = Date.now()) {
  const expires = now + receiptMaxAgeSeconds * 1000;
  return `${expires}.${await sign(secret, `account-deleted:${expires}`)}`;
}

export async function verifyReceipt(secret: string | undefined, value: string | undefined, now = Date.now()) {
  if (!secret || !value) return false;
  const [expiresText, signature, ...rest] = value.split(".");
  if (rest.length > 0 || !expiresText || !signature || !/^\d{10,16}$/.test(expiresText)) return false;
  const expires = Number(expiresText);
  // Not expired, and not dated further ahead than a receipt is ever issued for.
  if (expires <= now || expires - now > receiptMaxAgeSeconds * 1000) return false;
  return sameText(signature, await sign(secret, `account-deleted:${expires}`));
}
