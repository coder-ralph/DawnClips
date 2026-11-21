import "server-only";
import { commentImageKey, postMediaKeys } from "@/lib/media";
import { deleteObjects } from "@/lib/r2";
import type { createAdminSupabaseClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminSupabaseClient>>;

/** An R2 object and the profile it is filed under. Deletion is bound to that owner (isOwnedObjectKey) every time. */
export type MediaEntry = { key: string; ownerId: string };

const staleUploadMs = 6 * 60 * 60 * 1000;
const staleCommentImageMs = 60 * 60 * 1000;

/** Deletes the objects, owner by owner. Returns the keys that could not be deleted (an already-missing object is fine). */
export async function deleteMediaEntries(entries: MediaEntry[]) {
  const failed: string[] = [];
  const byOwner = new Map<string, string[]>();
  for (const entry of entries) byOwner.set(entry.ownerId, [...(byOwner.get(entry.ownerId) ?? []), entry.key]);
  for (const [ownerId, keys] of byOwner) {
    try {
      failed.push(...(await deleteObjects(keys, ownerId)).failed);
    } catch {
      failed.push(...keys);
    }
  }
  return { failed };
}

/** The keys of a photo post's images, derived from its owner and id (never read from storage). */
export async function postImageEntries(admin: Admin, ownerId: string, postId: string) {
  const rows = await admin.from("post_media").select("id, mime_type").eq("post_id", postId);
  if (rows.error) return { ok: false as const, entries: [] as MediaEntry[] };
  const { keys, invalid } = postMediaKeys(ownerId, postId, (rows.data ?? []).map((row) => ({ id: row.id as string, mimeType: row.mime_type as string })));
  if (invalid > 0) return { ok: false as const, entries: [] as MediaEntry[] };
  return { ok: true as const, entries: keys.map(({ key }) => ({ key, ownerId })) };
}

type CommentImageRow = { id: string; owner_id: string; mime_type: string };

function commentEntries(rows: CommentImageRow[]) {
  const entries: MediaEntry[] = [];
  for (const row of rows) {
    const key = commentImageKey(row.owner_id, row.id, row.mime_type);
    if (key) entries.push({ key, ownerId: row.owner_id });
  }
  return { entries, invalid: rows.length - entries.length };
}

/** Every image attached to a comment on this clip, whoever wrote the comment: deleting the clip deletes the comments. */
export async function commentImagesOnClip(admin: Admin, clipId: string) {
  const rows = await admin
    .from("comment_media")
    .select("id, owner_id, mime_type, comments!inner(clip_id)")
    .eq("comments.clip_id", clipId);
  if (rows.error) return { ok: false as const, entries: [] as MediaEntry[] };
  const { entries, invalid } = commentEntries((rows.data ?? []) as unknown as CommentImageRow[]);
  return { ok: invalid === 0, entries };
}

/** Every image attached to these comments (a comment and its replies), for deleting them. */
export async function commentImagesOf(admin: Admin, commentIds: string[]) {
  if (commentIds.length === 0) return { ok: true as const, entries: [] as MediaEntry[] };
  const rows = await admin.from("comment_media").select("id, owner_id, mime_type").in("comment_id", commentIds);
  if (rows.error) return { ok: false as const, entries: [] as MediaEntry[] };
  const { entries, invalid } = commentEntries((rows.data ?? []) as unknown as CommentImageRow[]);
  return { ok: invalid === 0, entries };
}

/** Images this person uploaded for comments that were never posted (or that are still waiting to be posted). */
export async function unattachedCommentImages(admin: Admin, ownerId: string, olderThanMs = 0) {
  let query = admin.from("comment_media").select("id, owner_id, mime_type").eq("owner_id", ownerId).neq("status", "attached");
  if (olderThanMs > 0) query = query.lt("created_at", new Date(Date.now() - olderThanMs).toISOString());
  const rows = await query;
  if (rows.error) return { ok: false as const, entries: [] as MediaEntry[], ids: [] as string[] };
  const data = (rows.data ?? []) as unknown as CommentImageRow[];
  return { ok: true as const, ...commentEntries(data), ids: data.map((row) => row.id) };
}

/** Marks a photo post failed and removes everything that was uploaded for it. False when an object could not be deleted. */
export async function discardPhotoPost(admin: Admin, ownerId: string, postId: string, status: "failed" | "removed" = "failed") {
  const found = await postImageEntries(admin, ownerId, postId);
  if (!found.ok) return false;
  const { failed } = await deleteMediaEntries(found.entries);
  if (failed.length > 0) return false;
  await admin.from("post_media").delete().eq("post_id", postId);
  await admin
    .from("clips")
    .update({ status })
    .eq("id", postId)
    .eq("user_id", ownerId)
    .eq("kind", "photo")
    .in("status", ["pending", "processing"]);
  return true;
}

/**
 * Photo posts this person started and never finished (closed the tab, lost the connection): their uploaded images are
 * deleted and the post is marked failed. Run before the pending-upload count so abandoned posts never block anyone.
 */
export async function sweepStalePhotoPosts(admin: Admin, ownerId: string) {
  const cutoff = new Date(Date.now() - staleUploadMs).toISOString();
  const stale = await admin
    .from("clips")
    .select("id")
    .eq("user_id", ownerId)
    .eq("kind", "photo")
    .in("status", ["pending", "processing"])
    .lt("created_at", cutoff);
  for (const post of stale.data ?? []) await discardPhotoPost(admin, ownerId, post.id as string);
}

/** Comment images uploaded more than an hour ago that never became part of a comment. */
export async function sweepStaleCommentImages(admin: Admin, ownerId: string) {
  const stale = await unattachedCommentImages(admin, ownerId, staleCommentImageMs);
  if (!stale.ok || stale.ids.length === 0) return;
  const { failed } = await deleteMediaEntries(stale.entries);
  if (failed.length > 0) return;
  await admin.from("comment_media").delete().in("id", stale.ids).eq("owner_id", ownerId).neq("status", "attached");
}

/**
 * Deletes a comment image that was never attached (or whose comment failed to post): the object first, then its row.
 * An image that has become part of a comment is left alone, so a repeated or racing request cannot remove it.
 * Returns false when the object could not be deleted; the row is kept so the sweep can retry.
 */
export async function discardUnattachedCommentImage(admin: Admin, ownerId: string, mediaId: string) {
  const found = await admin
    .from("comment_media")
    .select("id, owner_id, mime_type, status")
    .eq("id", mediaId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (found.error) return false;
  if (!found.data) return true;
  if (found.data.status === "attached") return true;
  const { entries } = commentEntries([found.data as unknown as CommentImageRow]);
  if (entries.length === 0) return false;
  const { failed } = await deleteMediaEntries(entries);
  if (failed.length > 0) return false;
  await admin.from("comment_media").delete().eq("id", mediaId).eq("owner_id", ownerId).neq("status", "attached");
  return true;
}
