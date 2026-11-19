"use client";

import { Ban, Link2, MoreHorizontal, Undo2, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { muteRestrictItems, useRelationshipActions } from "@/components/social/relationship-actions";
import { BlockDialog, RemoveFollowerDialog } from "@/components/social/relationship-dialogs";
import { ActionMenu, type MenuItem } from "@/components/ui/action-menu";
import { buttonClasses } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Relationship } from "@/lib/relationships";

/**
 * The "⋯" menu on someone else's profile: copy link, mute, restrict, remove follower (only when they follow you) and
 * block. Mute, restrict and block each show their current state and offer the way back, and a blocked profile only
 * offers Unblock, so no two actions ever contradict each other.
 */
export function ProfileMenu({
  profile,
  initial,
  onFollowerRemoved,
}: {
  profile: { id: string; username: string };
  initial: Relationship;
  /** Called once the person is no longer a follower, so the page can update the counts it shows. */
  onFollowerRemoved?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const actions = useRelationshipActions(profile, initial);
  const { relationship } = actions;
  const [dialog, setDialog] = useState<"block" | "remove" | null>(null);
  const close = () => setDialog(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(`/profile/${profile.username}`, window.location.origin).toString());
      toast("Profile link copied");
    } catch {
      toast("Could not copy the link", "error");
    }
  }

  const items: MenuItem[] = [{ label: "Copy link", icon: Link2, onSelect: () => void copyLink() }];
  if (!relationship.blocked) {
    items.push(...muteRestrictItems(profile.username, relationship, actions, true));
    if (relationship.followedBy) items.push({ label: "Remove follower", icon: UserX, onSelect: () => setDialog("remove") });
  }
  items.push({
    label: relationship.blocked ? `Unblock @${profile.username}` : `Block @${profile.username}`,
    icon: relationship.blocked ? Undo2 : Ban,
    danger: !relationship.blocked,
    separatorBefore: true,
    onSelect: () => setDialog("block"),
  });

  return (
    <>
      <ActionMenu
        label="More profile options"
        items={items}
        buttonClassName={buttonClasses({ variant: "secondary", className: "w-10 px-0!" })}
      >
        <MoreHorizontal aria-hidden="true" className="h-5 w-5" />
      </ActionMenu>
      {dialog === "remove" ? (
        <RemoveFollowerDialog
          username={profile.username}
          pending={actions.removing}
          onClose={close}
          onConfirm={() =>
            void actions.removeFollower().then((removed) => {
              if (!removed) return;
              close();
              onFollowerRemoved?.();
            })
          }
        />
      ) : null}
      {dialog === "block" ? (
        <BlockDialog
          username={profile.username}
          blocked={relationship.blocked}
          pending={actions.blocking}
          onClose={close}
          onConfirm={() =>
            void actions.setBlocked(!relationship.blocked).then((changed) => {
              if (!changed) return;
              close();
              // A blocked profile can no longer be opened, so leave it.
              if (!relationship.blocked) router.replace("/");
            })
          }
        />
      ) : null}
    </>
  );
}
