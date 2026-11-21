"use client";

import { useAuth } from "@clerk/nextjs";
import { Flag, Heart, ImageOff, MessageCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ReportDialog } from "@/components/feed/report-clip";
import { ProfileHoverLink } from "@/components/social/profile-hover-card";
import { CommentComposer, type CommentAttachment } from "@/components/social/comment-composer";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { inputClass } from "@/components/ui/field";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { commentLikeLabel } from "@/lib/a11y-labels";
import { apiErrorMessage } from "@/lib/api-client";
import { withLike, withLikeDefaults, withLikeState } from "@/lib/comment-likes";
import { commentImagePrepare, prepareImage } from "@/lib/image-prepare";
import { removeSubtree, restoreComments, subtreeIds, visibleComments } from "@/lib/comment-tree";
import { cn } from "@/lib/utils";
import { formatCount, formatRelativeTime } from "@/lib/video";

type Comment = {
  id: string;
  parent_id: string | null;
  content: string | null;
  created_at: string;
  deleted: boolean;
  is_own: boolean;
  likes_count: number;
  liked: boolean;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  /** The image attached to the comment, signed for this viewer (the R2 bucket is private). */
  media?: { id: string; width: number; height: number; url: string } | null;
};

type Attachment = CommentAttachment & { token: number; mediaId?: string; width: number; height: number; error?: string };

export type CommentViewer = { username: string; displayName: string; avatarUrl: string | null };

const MAX_LENGTH = 500;
const MAX_DEPTH = 4;

export function CommentSection({
  clipId,
  initialCount,
  viewer,
}: {
  clipId: string;
  initialCount: number;
  viewer: CommentViewer | null;
}) {
  const toast = useToast();
  const { isSignedIn } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [count, setCount] = useState(initialCount);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [reporting, setReporting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [pending, setPending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const tempCounter = useRef(0);
  // The image being attached to each composer ("new" for the main box, "reply-<id>" for a reply), and the large view.
  const [attachments, setAttachments] = useState<Record<string, Attachment>>({});
  const [attachmentErrors, setAttachmentErrors] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const attachmentsRef = useRef(attachments);
  const attachmentToken = useRef(0);
  const countIdBase = useId();
  const [popped, setPopped] = useState<string | null>(null);
  // Comments whose like request is still running, so a second click cannot send a second request.
  const likeInFlight = useRef(new Set<string>());
  // Comments whose deletion request is still running, so a second click cannot send a second request.
  const deleteInFlight = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    void fetch(`/api/clips/${clipId}/comments`)
      .then((response) => response.json())
      .then((body: { comments?: Comment[] }) => {
        if (active) setComments(visibleComments(body.comments ?? []).map(withLikeDefaults));
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clipId, reloadKey]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const item of Object.values(attachmentsRef.current)) URL.revokeObjectURL(item.previewUrl);
    };
  }, []);

  function setAttachmentError(key: string, message: string) {
    setAttachmentErrors((current) => {
      const next = { ...current };
      if (message) next[key] = message;
      else delete next[key];
      return next;
    });
  }

  function dropAttachment(key: string, { deleteUpload }: { deleteUpload: boolean }) {
    const item = attachmentsRef.current[key];
    if (!item) return;
    URL.revokeObjectURL(item.previewUrl);
    setAttachments((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    // An image that was uploaded but not posted is deleted from storage; the server also sweeps any that are left.
    if (deleteUpload && item.mediaId) void fetch(`/api/comments/media/${item.mediaId}`, { method: "DELETE" }).catch(() => undefined);
  }

  async function pickImage(key: string, file: File) {
    setAttachmentError(key, "");
    const prepared = await prepareImage(file, commentImagePrepare);
    if (!prepared.ok) {
      setAttachmentError(key, prepared.error);
      return;
    }
    const token = ++attachmentToken.current;
    const { image } = prepared;
    const previewUrl = URL.createObjectURL(image.file);
    const base = { token, previewUrl, width: image.width, height: image.height };
    setAttachments((current) => ({ ...current, [key]: { ...base, state: "uploading" } }));
    const stillWanted = () => attachmentsRef.current[key]?.token === token;
    let mediaId: string | undefined;
    try {
      const started = await fetch("/api/comments/media/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: image.mime, size: image.file.size, width: image.width, height: image.height }),
      });
      if (!started.ok) throw new Error(await apiErrorMessage(started, "Could not upload the photo."));
      const body = (await started.json()) as { mediaId: string; uploadUrl: string; headers: Record<string, string> };
      mediaId = body.mediaId;
      if (!stillWanted()) {
        void fetch(`/api/comments/media/${mediaId}`, { method: "DELETE" }).catch(() => undefined);
        return;
      }
      setAttachments((current) => (current[key]?.token === token ? { ...current, [key]: { ...current[key], mediaId } } : current));
      const sent = await fetch(body.uploadUrl, { method: "PUT", headers: body.headers, body: image.file });
      if (!sent.ok) throw new Error("Could not upload the photo.");
      setAttachments((current) => (current[key]?.token === token ? { ...current, [key]: { ...current[key], state: "ready" } } : current));
    } catch (caught) {
      if (!stillWanted()) return;
      if (mediaId) void fetch(`/api/comments/media/${mediaId}`, { method: "DELETE" }).catch(() => undefined);
      setAttachments((current) => (current[key]?.token === token ? { ...current, [key]: { ...current[key], state: "failed", mediaId: undefined } } : current));
      setAttachmentError(key, caught instanceof Error ? caught.message : "Could not upload the photo.");
    }
  }

  function removeImage(key: string) {
    setAttachmentError(key, "");
    dropAttachment(key, { deleteUpload: true });
  }

  async function submit(parentId: string | null, text: string, key: string) {
    const trimmed = text.trim();
    const attached = attachments[key]?.state === "ready" ? attachments[key] : null;
    if ((!trimmed && !attached) || pending) return;
    tempCounter.current += 1;
    const tempId = `temp-${tempCounter.current}`;
    const optimistic: Comment = {
      id: tempId,
      parent_id: parentId,
      content: trimmed,
      created_at: new Date().toISOString(),
      deleted: false,
      is_own: true,
      likes_count: 0,
      liked: false,
      username: viewer?.username ?? "",
      display_name: viewer?.displayName ?? "You",
      avatar_url: viewer?.avatarUrl ?? null,
      media: attached?.mediaId ? { id: attached.mediaId, width: attached.width, height: attached.height, url: attached.previewUrl } : null,
    };
    setComments((current) => [...current, optimistic]);
    setCount((value) => value + 1);
    setPending(true);
    try {
      const response = await fetch(`/api/clips/${clipId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, parentId, ...(attached?.mediaId ? { mediaId: attached.mediaId } : {}) }),
      });
      if (!response.ok) {
        setComments((current) => current.filter((item) => item.id !== tempId));
        setCount((value) => Math.max(0, value - 1));
        // The server deletes the image when a comment cannot be posted (unless it only needs another try), so the
        // person adds it again; the text stays in the box.
        if (attached && ![409, 429, 500, 502, 503].includes(response.status)) dropAttachment(key, { deleteUpload: false });
        toast(await apiErrorMessage(response, "Could not post the comment."), "error");
        return;
      }
      const saved = (await response.json()) as {
        id: string;
        content: string;
        parent_id: string | null;
        created_at: string;
        comments_count: number;
        media?: Comment["media"];
      };
      setComments((current) => current.map((item) => (item.id === tempId ? { ...optimistic, ...saved, media: saved.media ?? null, is_own: true, deleted: false } : item)));
      setCount(saved.comments_count);
      // The image is now part of the comment (shown from its signed URL), so the local preview is let go.
      dropAttachment(key, { deleteUpload: false });
      if (parentId) {
        setReplyText("");
        setReplyTo(null);
      } else {
        setContent("");
      }
    } catch {
      // Nothing is known about whether the server saw the request, so the image is kept for another try.
      setComments((current) => current.filter((item) => item.id !== tempId));
      setCount((value) => Math.max(0, value - 1));
      toast("Could not post the comment. Check your connection.", "error");
    } finally {
      setPending(false);
    }
  }

  async function saveEdit(id: string) {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const previous = comments;
    setComments((current) => current.map((item) => (item.id === id ? { ...item, content: trimmed } : item)));
    setEditing(null);
    const response = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: trimmed }),
    }).catch(() => null);
    if (!response?.ok) {
      setComments(previous);
      toast("Could not edit the comment.", "error");
    }
  }

  async function toggleLike(id: string) {
    if (likeInFlight.current.has(id)) return;
    const current = comments.find((item) => item.id === id);
    if (!current) return;
    const previous = { liked: current.liked, likes_count: current.likes_count };
    const next = !previous.liked;
    likeInFlight.current.add(id);
    setComments((list) => withLike(list, id, next));
    setPopped(next ? id : null);
    try {
      const response = await fetch(`/api/comments/${id}/like`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired: next }),
      }).catch(() => null);
      if (!response?.ok) {
        // Put back this comment's previous like state only, then say why. A refused like (the comment is gone, or
        // no longer visible) also reloads the list so it matches the server.
        setComments((list) => withLikeState(list, id, previous));
        toast(response ? await apiErrorMessage(response, "Could not update the like.") : "Could not update the like. Check your connection.", "error");
        if (response && (response.status === 403 || response.status === 404)) setReloadKey((value) => value + 1);
        return;
      }
      const body = (await response.json().catch(() => null)) as { liked?: boolean; likesCount?: number } | null;
      if (body && typeof body.liked === "boolean" && typeof body.likesCount === "number") {
        setComments((list) => withLikeState(list, id, { liked: body.liked as boolean, likes_count: body.likesCount as number }));
      }
    } finally {
      likeInFlight.current.delete(id);
    }
  }

  async function remove(id: string) {
    setDeleting(null);
    if (deleteInFlight.current.has(id)) return;
    // The comment and every reply beneath it go together (the database deletes them in one step).
    const { removed } = removeSubtree(comments, id);
    if (removed.length === 0) return;
    const ids = removed.map((item) => item.id);
    for (const removedId of ids) deleteInFlight.current.add(removedId);

    setComments((current) => removeSubtree(current, id).remaining);
    setCount((value) => Math.max(0, value - removed.length));
    if (editing && ids.includes(editing)) setEditing(null);
    if (replyTo && ids.includes(replyTo)) {
      setReplyTo(null);
      setReplyText("");
    }

    try {
      const response = await fetch(`/api/comments/${id}`, { method: "DELETE" }).catch(() => null);
      if (!response?.ok) {
        // Put back exactly what was removed, then say why. If the comment is already gone or is not the viewer's,
        // reload the list so it matches the server.
        setComments((current) => restoreComments(current, removed));
        setCount((value) => value + removed.length);
        toast(response ? await apiErrorMessage(response, "Could not delete the comment.") : "Could not delete the comment. Check your connection.", "error");
        if (response && (response.status === 403 || response.status === 404)) setReloadKey((value) => value + 1);
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { comments_count?: number; removed_ids?: string[] };
      if (Array.isArray(body.removed_ids)) {
        const gone = new Set(body.removed_ids);
        setComments((current) => current.filter((item) => !gone.has(item.id)));
      }
      if (typeof body.comments_count === "number") setCount(body.comments_count);
    } finally {
      for (const removedId of ids) deleteInFlight.current.delete(removedId);
    }
  }

  const deletingReplies = deleting ? Math.max(0, subtreeIds(comments, deleting).size - 1) : 0;
  const repliesOf = (parentId: string) => comments.filter((item) => item.parent_id === parentId);
  const roots = comments.filter((item) => !item.parent_id);

  function renderComment(comment: Comment, depth: number) {
    const replies = depth < MAX_DEPTH ? repliesOf(comment.id) : [];
    const canAct = !comment.id.startsWith("temp-");
    return (
      <li key={comment.id}>
        <div className={cn("flex gap-3", depth === 0 ? "px-4 py-3 md:px-5" : "pt-3")}>
          <div className="flex flex-col items-center">
            <ProfileHoverLink username={comment.username} href={`/profile/${comment.username}`} tabIndex={-1} aria-hidden="true" className="rounded-full">
              <Avatar src={comment.avatar_url} name={comment.display_name} size={depth === 0 ? 36 : 28} />
            </ProfileHoverLink>
            {replies.length > 0 || replyTo === comment.id ? <span className="mt-2 w-0.5 flex-1 rounded-full bg-line" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-5">
              <ProfileHoverLink username={comment.username} href={`/profile/${comment.username}`} className="font-semibold hover:underline">{comment.display_name}</ProfileHoverLink>
              <span className="text-muted"> · <time dateTime={comment.created_at} suppressHydrationWarning>{formatRelativeTime(comment.created_at)}</time></span>
            </p>
            {editing === comment.id ? (
              <form action={() => void saveEdit(comment.id)} className="mt-2 space-y-2">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={MAX_LENGTH}
                  rows={2}
                  aria-label="Edit comment"
                  className={cn(inputClass, "resize-none")}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={!draft.trim()}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <>
                {comment.content ? <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-6">{comment.content}</p> : null}
                {comment.media ? (
                  brokenImages[comment.media.id] ? (
                    <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-xl bg-card px-3 py-2 text-xs text-muted">
                      <ImageOff aria-hidden="true" className="h-4 w-4" /> This photo is not available.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLightbox({ src: comment.media!.url, alt: `Photo from ${comment.display_name}` })}
                      aria-label={`View photo from ${comment.display_name}`}
                      className="mt-1.5 block max-w-full overflow-hidden rounded-xl border bg-card focus-visible:outline-2 focus-visible:outline-accent-text"
                    >
                      {/* Signed R2 URLs are per viewer and expire, so next/image optimisation does not apply. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={comment.media.url}
                        alt={`Photo from ${comment.display_name}`}
                        width={comment.media.width}
                        height={comment.media.height}
                        loading="lazy"
                        onError={() => setBrokenImages((current) => ({ ...current, [comment.media!.id]: true }))}
                        className="block h-auto max-h-72 w-auto max-w-full object-contain"
                      />
                    </button>
                  )
                ) : null}
              </>
            )}
            {canAct && editing !== comment.id ? (
              <div className="-ml-2 mt-0.5 flex flex-wrap items-center text-xs">
                <button
                  type="button"
                  aria-label={commentLikeLabel(comment.liked)}
                  title={commentLikeLabel(comment.liked)}
                  aria-describedby={comment.likes_count > 0 ? `${countIdBase}-${comment.id}` : undefined}
                  onClick={() => void toggleLike(comment.id)}
                  className={cn("action-btn", comment.liked && "text-like hover:text-like")}
                >
                  <Heart
                    aria-hidden="true"
                    className={cn("h-4 w-4", popped === comment.id && comment.liked && "heart-pop")}
                    fill={comment.liked ? "currentColor" : "none"}
                  />
                  {comment.likes_count > 0 ? <span id={`${countIdBase}-${comment.id}`}>{formatCount(comment.likes_count)}</span> : null}
                </button>
                {isSignedIn && depth < MAX_DEPTH ? (
                  <button type="button" onClick={() => { dropAttachment(`reply-${replyTo ?? ""}`, { deleteUpload: true }); setReplyTo(replyTo === comment.id ? null : comment.id); setReplyText(""); }} className="action-btn">
                    <MessageCircle aria-hidden="true" className="h-4 w-4" /> Reply
                  </button>
                ) : null}
                {comment.is_own ? (
                  <>
                    <button type="button" onClick={() => { setEditing(comment.id); setDraft(comment.content ?? ""); }} className="action-btn">
                      <Pencil aria-hidden="true" className="h-4 w-4" /> Edit
                    </button>
                    <button type="button" onClick={() => setDeleting(comment.id)} className="action-btn">
                      <Trash2 aria-hidden="true" className="h-4 w-4" /> Delete
                    </button>
                  </>
                ) : isSignedIn ? (
                  <button type="button" onClick={() => setReporting(comment.id)} className="action-btn">
                    <Flag aria-hidden="true" className="h-4 w-4" /> Report
                  </button>
                ) : null}
              </div>
            ) : null}
            {replyTo === comment.id ? (
              <div className="mt-2">
                <CommentComposer
                  id={`reply-${comment.id}`}
                  label={`Reply to ${comment.display_name}`}
                  placeholder={`Reply to ${comment.display_name}…`}
                  value={replyText}
                  onChange={setReplyText}
                  onSubmit={() => void submit(comment.id, replyText, `reply-${comment.id}`)}
                  pending={pending}
                  maxLength={MAX_LENGTH}
                  submitLabel="Post reply"
                  autoFocus
                  onCancel={() => {
                    dropAttachment(`reply-${comment.id}`, { deleteUpload: true });
                    setAttachmentError(`reply-${comment.id}`, "");
                    setReplyTo(null);
                  }}
                  attachment={attachments[`reply-${comment.id}`] ?? null}
                  attachmentError={attachmentErrors[`reply-${comment.id}`]}
                  onPickImage={(file) => void pickImage(`reply-${comment.id}`, file)}
                  onRemoveImage={() => removeImage(`reply-${comment.id}`)}
                />
              </div>
            ) : null}
            {replies.length > 0 ? <ul>{replies.map((item) => renderComment(item, depth + 1))}</ul> : null}
          </div>
        </div>
      </li>
    );
  }

  return (
    <section id="comments" aria-labelledby="comments-title" className="scroll-mt-28 border-t">
      <h2 id="comments-title" className="px-4 pt-4 text-base font-bold md:px-5">
        Comments <span className="font-normal text-muted">{count}</span>
      </h2>

      {viewer ? (
        <div className="flex items-start gap-2.5 px-4 py-3 md:px-5">
          <span className="mt-1 shrink-0">
            <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={36} />
          </span>
          <div className="min-w-0 flex-1">
            <CommentComposer
              id="new-comment"
              label="Add a comment"
              placeholder="Add a comment…"
              value={content}
              onChange={setContent}
              onSubmit={() => void submit(null, content, "new")}
              pending={pending}
              maxLength={MAX_LENGTH}
              submitLabel="Post comment"
              attachment={attachments.new ?? null}
              attachmentError={attachmentErrors.new}
              onPickImage={(file) => void pickImage("new", file)}
              onRemoveImage={() => removeImage("new")}
            />
          </div>
        </div>
      ) : (
        <div className="mx-4 my-3 flex items-center justify-between gap-3 rounded-xl bg-card px-4 py-3 md:mx-5">
          <p className="text-sm text-muted">Log in to join the conversation.</p>
          <Link href="/sign-in" className={buttonClasses({ size: "sm" })}>Log in</Link>
        </div>
      )}

      {loading ? (
        <div className="space-y-4 px-4 py-3 md:px-5" role="status" aria-label="Loading comments">
          {[0, 1, 2].map((key) => (
            <div key={key} className="flex gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {loadError ? (
        <div role="alert" className="flex items-center justify-between gap-3 px-4 py-4 md:px-5">
          <p className="text-sm text-danger">Could not load comments.</p>
          <Button size="sm" variant="secondary" onClick={() => { setLoadError(false); setLoading(true); setReloadKey((value) => value + 1); }}>
            Try again
          </Button>
        </div>
      ) : null}
      {!loading && !loadError && roots.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted md:px-5">No comments yet. Start the conversation.</p>
      ) : null}
      <ul className="divide-y">{roots.map((comment) => renderComment(comment, 0))}</ul>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete this comment?"
        description={deletingReplies > 0 ? `This also deletes ${deletingReplies} ${deletingReplies === 1 ? "reply" : "replies"}. This cannot be undone.` : "This cannot be undone."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="dangerSolid" onClick={() => deleting && void remove(deleting)}>Delete</Button>
          </>
        }
      />
      {lightbox ? <ImageLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} /> : null}
      {reporting ? <ReportDialog open onClose={() => setReporting(null)} targetId={reporting} targetType="comment" /> : null}
    </section>
  );
}
