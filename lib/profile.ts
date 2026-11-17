import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { cache } from "react";
import { generateUsername } from "@/lib/username";
import { logDbError } from "@/lib/db-log";
import { provisionProfile } from "@/lib/profile-provision";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/utils";
import type { OwnProfile, ProfileRow, PublicProfile } from "@/types/database";

const ownProfileColumns =
  "id, clerk_user_id, email, email_verified, display_name, username, avatar_url, bio, role_id, zone_id, country, language, deletion_status, created_at";

export type ProfileSyncResult =
  | { status: "signed_out" }
  | { status: "unconfigured" }
  | { status: "pending_deletion"; profile: OwnProfile }
  | { status: "ready"; profile: OwnProfile }
  | { status: "error"; message: string };

function mapOwnProfile(row: ProfileRow): OwnProfile {
  return {
    id: row.id,
    clerkUserId: row.clerk_user_id,
    email: row.email,
    emailVerified: row.email_verified,
    displayName: row.display_name,
    username: row.username,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    roleId: row.role_id,
    zoneId: row.zone_id,
    country: row.country,
    language: row.language,
    deletionStatus: row.deletion_status,
    createdAt: row.created_at,
  };
}

function mapPublicProfile(value: unknown): PublicProfile | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.username !== "string") return null;
  return {
    id: row.id,
    displayName: String(row.display_name ?? ""),
    username: row.username,
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    bio: String(row.bio ?? ""),
    roleId: typeof row.role_id === "string" && row.role_id ? row.role_id : null,
    country: String(row.country ?? "PH"),
    createdAt: String(row.created_at ?? ""),
    isOwn: Boolean(row.is_own),
    showHighlights: Boolean(row.show_highlights),
    showFollowing: Boolean(row.show_following),
    showFollowers: Boolean(row.show_followers),
    showComments: Boolean(row.show_comments),
    showLikes: Boolean(row.show_likes),
    clipsCount: typeof row.clips_count === "number" ? row.clips_count : null,
    followersCount: typeof row.followers_count === "number" ? row.followers_count : null,
    followingCount: typeof row.following_count === "number" ? row.following_count : null,
  };
}

/**
 * The signed-in person's Clerk user, or null when there is none. A deleted account is the one case that matters: its
 * session cookie stays valid for up to a minute, so a request can still arrive as that user after Clerk has removed
 * it, and Clerk answers the lookup with a 404. That is "signed out", not a server error. Any other failure (Clerk
 * unreachable, rate limited) is rethrown so it is never mistaken for a missing account.
 */
export const currentClerkUser = cache(async function currentClerkUser() {
  try {
    return await currentUser();
  } catch (error) {
    if (isClerkAPIResponseError(error) && error.status === 404) return null;
    throw error;
  }
});

/**
 * Wrapped in React.cache: during one page render the clip lookup, the shell and the feed hydration all ask for the
 * viewer's profile, and each used to repeat the Clerk check and the profile query. Route handlers and server
 * actions are not memoised, so a write is always followed by a fresh read there.
 */
export const ensureCurrentProfile = cache(async function ensureCurrentProfile(): Promise<ProfileSyncResult> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return { status: "signed_out" };

  const supabase = createServerSupabaseClient();
  if (!supabase) return { status: "unconfigured" };

  const existing = await supabase
    .from("profiles")
    .select(ownProfileColumns)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (existing.error) {
    logDbError("Profile lookup failed", existing.error);
    return { status: "error", message: safeErrorMessage(existing.error, "Could not load your profile.") };
  }
  if (existing.data) {
    const profile = mapOwnProfile(existing.data);
    if (profile.deletionStatus !== "active") {
      return { status: "pending_deletion", profile };
    }
    return { status: "ready", profile };
  }

  let user: Awaited<ReturnType<typeof currentClerkUser>>;
  try {
    user = await currentClerkUser();
  } catch (error) {
    console.error(`Clerk user lookup failed [${isClerkAPIResponseError(error) ? error.status : "no-status"}]`);
    return { status: "error", message: "Could not load your account. Try again." };
  }
  // No Clerk user behind the session (the account was deleted): there is nothing to create a profile for.
  if (!user) return { status: "signed_out" };

  const displayName = (user.fullName || user.firstName || "Player").slice(0, 40);
  const email = user.primaryEmailAddress?.emailAddress ?? null;
  const emailVerified = user.primaryEmailAddress?.verification?.status === "verified";
  const admin = createAdminSupabaseClient();

  const result = await provisionProfile<ProfileRow>({
    nextUsername: () => generateUsername(displayName),
    insert: async (username) => {
      const inserted = await supabase
        .from("profiles")
        .insert({
          clerk_user_id: userId,
          email,
          email_verified: emailVerified,
          display_name: displayName,
          username,
          avatar_url: user.imageUrl ?? null,
          avatar_source: "clerk",
          country: "PH",
          language: "en",
        })
        .select(ownProfileColumns)
        .single();
      return { data: inserted.data, error: inserted.error };
    },
    readOwn: async () => (await supabase.from("profiles").select(ownProfileColumns).eq("clerk_user_id", userId).maybeSingle()).data,
    // Same account only: the id comes from the verified session, never from the request.
    readAny: async () =>
      admin ? (await admin.from("profiles").select(ownProfileColumns).eq("clerk_user_id", userId).maybeSingle()).data : null,
  });

  if (result.status === "ready") {
    const profile = mapOwnProfile(result.row);
    return profile.deletionStatus === "active" ? { status: "ready", profile } : { status: "pending_deletion", profile };
  }
  if (result.status === "username_taken") {
    return { status: "error", message: "Could not create a unique username. Try again." };
  }
  // Code and constraint name only, so a failing sign-up can be diagnosed from the server log.
  logDbError(result.status === "unreadable" ? "Profile exists but could not be read" : "Profile creation failed", result.error);
  return { status: "error", message: safeErrorMessage(result.error, "Could not create your profile.") };
});

export async function getOwnProfile(): Promise<ProfileSyncResult> {
  return ensureCurrentProfile();
}

export async function getPublicProfile(lookup: string) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return { status: "unconfigured" as const, profile: null };

  const { data, error } = await supabase.rpc("get_public_profile", { lookup });
  if (error) {
    logDbError("Public profile lookup failed", error);
    return {
      status: "error" as const,
      profile: null,
      message: safeErrorMessage(error, "Could not load this profile."),
    };
  }

  return { status: "ready" as const, profile: mapPublicProfile(data) };
}
