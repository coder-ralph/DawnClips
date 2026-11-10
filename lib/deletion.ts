import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import { canEraseRecords, remainingObjectKeys } from "@/lib/deletion-plan";
import { deleteObjects, r2Configured } from "@/lib/r2";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

type Job = {
  id: string;
  profile_id: string;
  status: string;
  r2_object_keys: string[];
  r2_deleted_keys: string[];
  r2_failed_keys: string[];
  attempts: number;
};

export async function deleteAccount(clerkUserId: string) {
  const admin = createAdminSupabaseClient();
  if (!admin) return { ok: false as const, error: "Database is not configured.", retryable: false };

  const profile = await admin
    .from("profiles")
    .select("id, deletion_status")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (profile.error || !profile.data) return { ok: false as const, error: "Profile not found.", retryable: false };

  await admin.from("profiles").update({
    deletion_status: "pending_deletion",
    deleted_at: new Date().toISOString(),
  }).eq("id", profile.data.id);

  const existing = await admin.from("account_deletions").select("*").eq("profile_id", profile.data.id).maybeSingle();
  let job = existing.data as Job | null;
  if (!job) {
    const created = await admin.from("account_deletions").insert({
      profile_id: profile.data.id,
      clerk_user_id: clerkUserId,
      status: "collecting_objects",
    }).select("*").single();
    if (created.error || !created.data) return { ok: false as const, error: "Could not start deletion.", retryable: true };
    job = created.data as Job;
  }

  const clips = await admin.from("clips").select("r2_object_key, thumbnail_object_key").eq("user_id", profile.data.id);
  const foundKeys = (clips.data ?? []).flatMap((clip) => [clip.r2_object_key, clip.thumbnail_object_key]).filter((key): key is string => Boolean(key));
  const keys = [...new Set([...(job.r2_object_keys ?? []), ...foundKeys])];
  await admin.from("account_deletions").update({
    status: "deleting_objects",
    r2_object_keys: keys,
    attempts: (job.attempts ?? 0) + 1,
  }).eq("id", job.id);

  const pending = remainingObjectKeys(keys, job.r2_deleted_keys ?? []);
  if (pending.length > 0 && !r2Configured()) {
    await admin.from("account_deletions").update({
      status: "failed",
      r2_failed_keys: pending,
      last_error: "Video storage is not configured.",
    }).eq("id", job.id);
    return { ok: false as const, error: "Video storage is not configured. The account was not deleted.", retryable: true };
  }

  const removed = pending.length > 0 ? await deleteObjects(pending) : { deleted: [], failed: [] };
  const actuallyDeleted = [...new Set([...(job.r2_deleted_keys ?? []), ...removed.deleted])];
  const failed = removed.failed;
  if (!canEraseRecords(failed)) {
    await admin.from("account_deletions").update({
      status: "failed",
      r2_deleted_keys: actuallyDeleted,
      r2_failed_keys: failed,
      last_error: "Some videos could not be deleted.",
    }).eq("id", job.id);
    return { ok: false as const, error: "Some videos could not be deleted. Nothing else was removed.", retryable: true };
  }

  await admin.from("account_deletions").update({
    status: "deleting_records",
    r2_deleted_keys: [...new Set([...actuallyDeleted, ...pending])],
    r2_failed_keys: [],
  }).eq("id", job.id);

  const clipIds = (await admin.from("clips").select("id").eq("user_id", profile.data.id)).data?.map((clip) => clip.id) ?? [];
  if (clipIds.length > 0) {
    await admin.from("clip_views").delete().in("clip_id", clipIds);
    await admin.from("likes").delete().in("clip_id", clipIds);
    await admin.from("comments").delete().in("clip_id", clipIds);
    await admin.from("bookmarks").delete().in("clip_id", clipIds);
    await admin.from("clips").delete().eq("user_id", profile.data.id);
  }
  await admin.from("likes").delete().eq("user_id", profile.data.id);
  await admin.from("comments").delete().eq("user_id", profile.data.id);
  await admin.from("bookmarks").delete().eq("user_id", profile.data.id);
  await admin.from("follows").delete().or(`follower_id.eq.${profile.data.id},following_id.eq.${profile.data.id}`);
  await admin.from("blocks").delete().or(`blocker_id.eq.${profile.data.id},blocked_id.eq.${profile.data.id}`);
  await admin.from("notifications").delete().or(`recipient_id.eq.${profile.data.id},actor_id.eq.${profile.data.id}`);
  await admin.from("reports").delete().eq("reporter_id", profile.data.id);

  const stillThere = await admin.from("clips").select("id").eq("user_id", profile.data.id);
  if ((stillThere.data ?? []).length > 0) {
    await admin.from("account_deletions").update({ status: "failed", last_error: "Clip records remain." }).eq("id", job.id);
    return { ok: false as const, error: "Account records could not be removed.", retryable: true };
  }

  await admin.from("account_deletions").update({ status: "deleting_clerk" }).eq("id", job.id);
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(clerkUserId);
  } catch (error) {
    const missing = error instanceof Error && /not found/i.test(error.message);
    if (!missing) {
      await admin.from("account_deletions").update({
        status: "deleting_clerk",
        last_error: "The sign-in account could not be deleted.",
      }).eq("id", job.id);
      return { ok: false as const, error: "Videos were removed, but the sign-in account remains. Retry deletion.", retryable: true };
    }
  }

  await admin.from("profiles").update({ deletion_status: "deleted" }).eq("id", profile.data.id);
  await admin.from("account_deletions").delete().eq("id", job.id);
  await admin.from("profile_settings").delete().eq("profile_id", profile.data.id);
  const removedProfile = await admin.from("profiles").delete().eq("id", profile.data.id);
  if (removedProfile.error) {
    return { ok: true as const, warning: "The sign-in account was deleted. A locked profile row remains marked deleted." };
  }
  return { ok: true as const };
}
