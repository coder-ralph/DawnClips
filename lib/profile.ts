import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { generateUsername } from "@/lib/username";
import { logDbError } from "@/lib/db-log";
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

export async function ensureCurrentProfile(): Promise<ProfileSyncResult> {
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

  const user = await currentUser();
  const displayName = (user?.fullName || user?.firstName || "Player").slice(0, 40);
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const emailVerified = user?.primaryEmailAddress?.verification?.status === "verified";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const inserted = await supabase
      .from("profiles")
      .insert({
        clerk_user_id: userId,
        email,
        email_verified: emailVerified,
        display_name: displayName,
        username: generateUsername(displayName),
        avatar_url: user?.imageUrl ?? null,
        avatar_source: "clerk",
        country: "PH",
        language: "en",
      })
      .select(ownProfileColumns)
      .single();

    if (!inserted.error && inserted.data) {
      return { status: "ready", profile: mapOwnProfile(inserted.data) };
    }

    if (inserted.error?.code === "23505") {
      const again = await supabase
        .from("profiles")
        .select(ownProfileColumns)
        .eq("clerk_user_id", userId)
        .maybeSingle();
      if (again.data) return { status: "ready", profile: mapOwnProfile(again.data) };
      continue;
    }

    if (inserted.error) logDbError("Profile creation failed", inserted.error);
    return {
      status: "error",
      message: safeErrorMessage(inserted.error, "Could not create your profile."),
    };
  }

  return { status: "error", message: "Could not create a unique username. Try again." };
}

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
