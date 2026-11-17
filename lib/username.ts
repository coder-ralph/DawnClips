export const reservedUsernames = [
  "admin",
  "administrator",
  "api",
  "clip",
  "clips",
  "dawnclips",
  "explore",
  "help",
  "login",
  "logout",
  "mlbb",
  "moderator",
  "moonton",
  "notifications",
  "official",
  "profile",
  "settings",
  "signin",
  "sign-in",
  "signup",
  "sign-up",
  "support",
  "system",
  "upload",
  "user",
  "users",
] as const;

const usernamePattern = /^[a-z0-9_]{3,20}$/;

export function isReservedUsername(value: string) {
  return reservedUsernames.includes(value as (typeof reservedUsernames)[number]);
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function usernameError(value: string) {
  const username = normalizeUsername(value);
  if (!usernamePattern.test(username)) {
    return "Use 3–20 lowercase letters, numbers, or underscores.";
  }
  if (isReservedUsername(username)) {
    return "That username is reserved.";
  }
  return null;
}

const suffixAlphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Always exactly `length` characters (Math.random().toString(36) can return fewer), from the platform's secure RNG. */
function randomSuffix(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => suffixAlphabet[byte % suffixAlphabet.length]).join("");
}

export function generateUsername(displayName: string) {
  const base = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "player";
  const suffix = randomSuffix(5);
  const username = `${base}${suffix}`.slice(0, 20);
  return usernameError(username) ? `player${suffix}` : username;
}
