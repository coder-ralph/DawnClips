export function confirmedDeletion(value: unknown) {
  return value === "DELETE";
}

export function remainingObjectKeys(allKeys: string[], deletedKeys: string[]) {
  const done = new Set(deletedKeys);
  return [...new Set(allKeys.filter((key) => key && !done.has(key)))];
}

export function canEraseRecords(failedKeys: string[]) {
  return failedKeys.length === 0;
}

export function isModerator(clerkUserId: string | null | undefined) {
  if (!clerkUserId) return false;
  const allowed = (process.env.MODERATOR_CLERK_USER_IDS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(clerkUserId);
}
