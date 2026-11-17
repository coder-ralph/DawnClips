export type InsertError = { code?: string | null; message?: string | null; details?: string | null };

export type ProvisionResult<T> =
  | { status: "ready"; row: T }
  /** Every generated username was already taken. */
  | { status: "username_taken" }
  /** The account already has a profile row, but neither read could return it. */
  | { status: "unreadable"; error: InsertError }
  | { status: "failed"; error: InsertError };

/** Which unique constraint a 23505 came from. Postgres names them <table>_<column>_key. */
export function conflictKind(error: InsertError): "username" | "identity" | "unknown" {
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (/profiles_username_key|\(username\)/.test(text)) return "username";
  if (/profiles_clerk_user_id_key|\(clerk_user_id\)/.test(text)) return "identity";
  return "unknown";
}

/**
 * Creates the profile row for a signed-in account that has none yet.
 *
 * Several requests can reach this at the same moment for a brand-new account (the page, the app chrome, prefetches,
 * the Clerk webhook). Exactly one insert wins; the others get a unique violation on clerk_user_id. That is not a
 * failure: the profile exists, so it is read back (first through the person's own session, then with the server's
 * service role in case the row is not visible to that session yet) and returned. Only a clash on the *username*
 * is retried with a new username, so a lost race can never be mistaken for a taken username.
 */
export async function provisionProfile<T>({
  nextUsername,
  insert,
  readOwn,
  readAny,
  maxAttempts = 8,
}: {
  nextUsername: () => string;
  insert: (username: string) => Promise<{ data: T | null; error: InsertError | null }>;
  readOwn: () => Promise<T | null>;
  readAny: () => Promise<T | null>;
  maxAttempts?: number;
}): Promise<ProvisionResult<T>> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const inserted = await insert(nextUsername());
    if (!inserted.error && inserted.data) return { status: "ready", row: inserted.data };
    if (inserted.error?.code !== "23505") {
      return { status: "failed", error: inserted.error ?? { message: "The profile was not returned." } };
    }

    const kind = conflictKind(inserted.error);
    if (kind !== "username") {
      const row = (await readOwn()) ?? (await readAny());
      if (row) return { status: "ready", row };
      // The account's row exists but cannot be read: new usernames cannot help, so stop instead of looping.
      if (kind === "identity") return { status: "unreadable", error: inserted.error };
    }
  }
  return { status: "username_taken" };
}
