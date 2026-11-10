"use client";

import { useAuth } from "@clerk/nextjs";
import {
  Ban,
  BarChart3,
  Bookmark,
  BookmarkX,
  Code2,
  Flag,
  Link2,
  MessageSquareOff,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Tags,
  Trash2,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EditClipDialog, type ClipPatch } from "@/components/clip/edit-clip-dialog";
import { EmbedDialog } from "@/components/clip/embed-dialog";
import { InsightsDialog } from "@/components/clip/insights-dialog";
import { ReportDialog } from "@/components/feed/report-clip";
import { ActionMenu, type MenuItem } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { CommentSettingsDialog, DeleteClipDialog, type CommentsMode } from "@/components/video/clip-owner-controls";
import { apiErrorMessage } from "@/lib/api-client";
import { editWindowMs, formatCountdown } from "@/lib/clip-text";
import { useNow } from "@/lib/use-now";

type Dialogs = "report" | "block" | "comments" | "delete" | "edit" | "embed" | "insights" | null;

export type MenuClip = {
  id: string;
  userId: string;
  username: string;
  title: string;
  description: string;
  heroTags: string[];
  visibility?: "public" | "unlisted" | "private";
  editableUntil?: string | null;
};

/**
 * The "⋯" menu on a clip. Everyone: copy link, embed code, save. Creators also
 * get Insights, Edit (15 minutes), Pin to profile, moments, comment settings
 * and delete. Other viewers get report and block.
 */
export function ClipMenu({
  clip,
  isOwn,
  commentsMode = "everyone",
  blocked = false,
  saved = false,
  pinned = false,
  onSavedChange,
  onPinnedChange,
  onEdited,
  onDeleted,
}: {
  clip: MenuClip;
  isOwn: boolean;
  commentsMode?: CommentsMode;
  blocked?: boolean;
  saved?: boolean;
  pinned?: boolean;
  onSavedChange?: (saved: boolean) => void;
  onPinnedChange?: (pinned: boolean) => void;
  onEdited?: (patch: ClipPatch) => void;
  onDeleted?: () => void;
}) {
  const { id: clipId, userId: authorId, username } = clip;
  const isPublic = (clip.visibility ?? "public") === "public";
  const router = useRouter();
  const toast = useToast();
  const { isSignedIn } = useAuth();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [isBlocked, setIsBlocked] = useState(blocked);
  const [pending, setPending] = useState(false);
  const now = useNow(clip.editableUntil, Boolean(isSignedIn && isOwn));
  const windowLeft = now === null ? null : editWindowMs(clip.editableUntil, now);
  const canEdit = Boolean(isOwn && clip.editableUntil && (windowLeft === null ? true : windowLeft > 0));
  const close = () => setDialog(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(`/clip/${clipId}`, window.location.origin).toString());
      toast("Link copied");
    } catch {
      toast("Could not copy the link", "error");
    }
  }

  async function toggleSaved() {
    const next = !saved;
    try {
      const response = await fetch(`/api/clips/${clipId}/bookmark`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired: next }),
      });
      if (!response.ok) {
        toast(await apiErrorMessage(response, "Could not update the bookmark."), "error");
        return;
      }
      onSavedChange?.(next);
      toast(next ? "Saved to your bookmarks" : "Removed from your bookmarks");
    } catch {
      toast("Could not update the bookmark. Check your connection.", "error");
    }
  }

  async function togglePinned() {
    const next = !pinned;
    try {
      const response = await fetch(`/api/clips/${clipId}/pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired: next }),
      });
      if (!response.ok) {
        toast(await apiErrorMessage(response, "Could not update your pinned clip."), "error");
        return;
      }
      onPinnedChange?.(next);
      toast(next ? "Pinned to your profile" : "Unpinned from your profile");
      router.refresh();
    } catch {
      toast("Could not update your pinned clip. Check your connection.", "error");
    }
  }

  async function toggleBlock() {
    setPending(true);
    const next = !isBlocked;
    try {
      const response = await fetch(`/api/profiles/${authorId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desired: next }),
      });
      if (!response.ok) {
        toast(await apiErrorMessage(response, "Could not update the block."), "error");
        return;
      }
      setIsBlocked(next);
      toast(next ? `Blocked @${username}` : `Unblocked @${username}`);
      close();
      router.refresh();
    } catch {
      toast("Could not update the block. Check your connection.", "error");
    } finally {
      setPending(false);
    }
  }

  const items: MenuItem[] = [];
  if (isSignedIn && isOwn) {
    items.push(
      { label: "Insights", icon: BarChart3, onSelect: () => setDialog("insights") },
      {
        label: "Edit",
        icon: Pencil,
        disabled: !canEdit,
        meta: !clip.editableUntil ? undefined : windowLeft === null ? "15:00" : windowLeft > 0 ? formatCountdown(windowLeft) : "Closed",
        onSelect: () => setDialog("edit"),
      },
    );
  }
  items.push({ label: "Copy link", icon: Link2, separatorBefore: items.length > 0, onSelect: () => void copyLink() });
  if (isPublic) items.push({ label: "Get embed code", icon: Code2, onSelect: () => setDialog("embed") });
  if (isSignedIn) {
    items.push({
      label: saved ? "Unsave" : "Save",
      icon: saved ? BookmarkX : Bookmark,
      separatorBefore: true,
      onSelect: () => void toggleSaved(),
    });
  }
  if (isSignedIn && isOwn) {
    if (isPublic) {
      items.push({ label: pinned ? "Unpin from profile" : "Pin to profile", icon: pinned ? PinOff : Pin, onSelect: () => void togglePinned() });
    }
    items.push(
      { label: "Tag moments", icon: Tags, href: `/clip/${clipId}#moments` },
      { label: "Comment settings", icon: MessageSquareOff, onSelect: () => setDialog("comments") },
      { label: "Delete clip", icon: Trash2, danger: true, separatorBefore: true, onSelect: () => setDialog("delete") },
    );
  } else if (isSignedIn) {
    items.push(
      { label: "Report clip", icon: Flag, danger: true, separatorBefore: true, onSelect: () => setDialog("report") },
      {
        label: isBlocked ? `Unblock @${username}` : `Block @${username}`,
        icon: isBlocked ? Undo2 : Ban,
        danger: !isBlocked,
        onSelect: () => setDialog("block"),
      },
    );
  }

  return (
    <>
      <ActionMenu
        label="Clip options"
        items={items}
        buttonClassName="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-foreground"
      >
        <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
      </ActionMenu>
      {dialog === "report" ? <ReportDialog open onClose={close} targetId={clipId} targetType="clip" /> : null}
      {dialog === "comments" ? <CommentSettingsDialog open onClose={close} clipId={clipId} initialMode={commentsMode} /> : null}
      {dialog === "delete" ? (
        <DeleteClipDialog open onClose={close} clipId={clipId} onDeleted={onDeleted ?? (() => router.replace("/"))} />
      ) : null}
      {dialog === "embed" ? <EmbedDialog open onClose={close} clipId={clipId} title={clip.title} /> : null}
      {dialog === "insights" ? <InsightsDialog open onClose={close} clipId={clipId} title={clip.title} /> : null}
      {dialog === "edit" ? (
        <EditClipDialog
          open
          onClose={close}
          clipId={clipId}
          title={clip.title}
          description={clip.description}
          heroTags={clip.heroTags}
          editableUntil={clip.editableUntil ?? null}
          onEdited={(patch) => {
            if (onEdited) onEdited(patch);
            else router.refresh();
          }}
        />
      ) : null}
      {dialog === "block" ? (
        <Dialog
          open
          onClose={close}
          title={isBlocked ? `Unblock @${username}?` : `Block @${username}?`}
          description={
            isBlocked
              ? "You will be able to see each other's clips again."
              : "You will no longer see each other's clips, and neither of you can follow the other."
          }
          footer={
            <>
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <Button variant={isBlocked ? "primary" : "dangerSolid"} loading={pending} onClick={() => void toggleBlock()}>
                {isBlocked ? "Unblock" : "Block"}
              </Button>
            </>
          }
        />
      ) : null}
    </>
  );
}
