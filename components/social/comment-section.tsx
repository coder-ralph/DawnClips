"use client";

import { useAuth } from "@clerk/nextjs";
import { Flag, MessageCircle, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ReportDialog } from "@/components/feed/report-clip";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { inputClass } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { apiErrorMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/video";

type Comment = {
  id: string;
  parent_id: string | null;
  content: string | null;
  created_at: string;
  deleted: boolean;
  is_own: boolean;
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

  useEffect(() => {
    let active = true;
    void fetch(`/api/clips/${clipId}/comments`)
      .then((response) => response.json())
      .then((body: { comments?: Comment[] }) => {
        if (active) setComments(body.comments ?? []);
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

  async function remove(id: string) {
    const previous = comments;
    const previousCount = count;
    setDeleting(null);
    setComments((current) => current.filter((item) => item.id !== id));
    setCount((value) => Math.max(0, value - 1));
    const response = await fetch(`/api/comments/${id}`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) {
      setComments(previous);
      setCount(previousCount);
      toast("Could not delete the comment.", "error");
      return;
    }
    const body = (await response.json()) as { comments_count?: number };
    if (typeof body.comments_count === "number") setCount(body.comments_count);
  }

  const repliesOf = (parentId: string) => comments.filter((item) => item.parent_id === parentId);
  const roots = comments.filter((item) => !item.parent_id);

  function renderComment(comment: Comment, depth: number) {
    const replies = depth < MAX_DEPTH ? repliesOf(comment.id) : [];
    const canAct = !comment.deleted && !comment.id.startsWith("temp-");
    return (
      <li key={comment.id}>
        <div className={cn("flex gap-3", depth === 0 ? "px-4 py-3 md:px-5" : "pt-3")}>
          <div className="flex flex-col items-center">
            <Link href={`/profile/${comment.username}`} tabIndex={-1} aria-hidden="true" className="rounded-full">
              <Avatar src={comment.avatar_url} name={comment.display_name} size={depth === 0 ? 36 : 28} />
            </Link>
            {replies.length > 0 || replyTo === comment.id ? <span className="mt-2 w-0.5 flex-1 rounded-full bg-line" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-5">
              <Link href={`/profile/${comment.username}`} className="font-semibold hover:underline">{comment.display_name}</Link>
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
              <p className={cn("mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-6", comment.deleted && "italic text-muted")}>
                {comment.deleted ? "Comment deleted." : comment.content}
              </p>
            )}
            {canAct && editing !== comment.id ? (
              <div className="-ml-2 mt-0.5 flex flex-wrap items-center text-xs">
                {isSignedIn ? (
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
              <form action={() => void submit(comment.id, replyText)} className="mt-2 space-y-2">
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  maxLength={MAX_LENGTH}
                  rows={2}
                  autoFocus
                  placeholder={`Reply to ${comment.display_name}…`}
                  aria-label={`Reply to ${comment.display_name}`}
                  className={cn(inputClass, "resize-none")}
                />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={pending} disabled={!replyText.trim()}>Reply</Button>
                  <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>Cancel</Button>
                </div>
              </form>
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
        <form action={() => void submit(null, content)} className="flex gap-3 px-4 py-3 md:px-5">
          <Avatar src={viewer.avatarUrl} name={viewer.displayName} size={36} />
          <div className="min-w-0 flex-1">
            <label htmlFor="new-comment" className="sr-only">Add a comment</label>
            <textarea
              id="new-comment"
              value={content}
              onChange={(event) => setContent(event.target.value)}
              maxLength={MAX_LENGTH}
              rows={2}
              placeholder="Add a comment…"
              className={cn(inputClass, "field-sizing-content max-h-48 min-h-[3.25rem] resize-none")}
            />
            <div className="mt-2 flex items-center justify-end gap-3">
              {content.length > 400 ? <span className="text-xs tabular-nums text-muted">{content.length}/{MAX_LENGTH}</span> : null}
              <Button type="submit" size="sm" loading={pending} disabled={!content.trim()}>
                {pending ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>
        </form>
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
        description="This cannot be undone."
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
