"use client";

import { useAuth } from "@clerk/nextjs";
import { Flag, Heart, MessageCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { ReportDialog } from "@/components/feed/report-clip";
import { ProfileHoverLink } from "@/components/social/profile-hover-card";
import { CommentComposer } from "@/components/social/comment-composer";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { inputClass } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { commentLikeLabel } from "@/lib/a11y-labels";
import { apiErrorMessage } from "@/lib/api-client";
import { withLike, withLikeDefaults, withLikeState } from "@/lib/comment-likes";
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
};

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

  async function submit(parentId: string | null, text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
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
    };
    setComments((current) => [...current, optimistic]);
    setCount((value) => value + 1);
    setPending(true);
    try {
      const response = await fetch(`/api/clips/${clipId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed, parentId }),
      });
      if (!response.ok) {
        setComments((current) => current.filter((item) => item.id !== tempId));
        setCount((value) => Math.max(0, value - 1));
        toast(await apiErrorMessage(response, "Could not post the comment."), "error");
        return;
      }
      const saved = (await response.json()) as { id: string; content: string; parent_id: string | null; created_at: string; comments_count: number };
      setComments((current) => current.map((item) => (item.id === tempId ? { ...optimistic, ...saved, is_own: true, deleted: false } : item)));
      setCount(saved.comments_count);
      if (parentId) {
        setReplyText("");
        setReplyTo(null);
      } else {
        setContent("");
      }
    } catch {
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
              <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-6">{comment.content}</p>
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
                  <button type="button" onClick={() => { setReplyTo(replyTo === comment.id ? null : comment.id); setReplyText(""); }} className="action-btn">
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
                  onSubmit={() => void submit(comment.id, replyText)}
                  pending={pending}
                  maxLength={MAX_LENGTH}
                  submitLabel="Post reply"
                  autoFocus
                  onCancel={() => setReplyTo(null)}
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
              onSubmit={() => void submit(null, content)}
              pending={pending}
              maxLength={MAX_LENGTH}
              submitLabel="Post comment"
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
      {reporting ? <ReportDialog open onClose={() => setReporting(null)} targetId={reporting} targetType="comment" /> : null}
    </section>
  );
}
