"use client";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

/** Confirmation for Block and Unblock, shared by the clip menu, the profile menu and the Blocked profiles list. */
export function BlockDialog({
  username,
  blocked,
  pending,
  onConfirm,
  onClose,
}: {
  username: string;
  /** True when the person is blocked now, so this asks about unblocking. */
  blocked: boolean;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={blocked ? `Unblock @${username}?` : `Block @${username}?`}
      description={
        blocked
          ? "You will be able to see each other's clips again, and either of you can follow the other. Follows that ended when you blocked are not restored."
          : "You will no longer see each other's clips, and any follows between you end. Neither of you can follow the other."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={blocked ? "primary" : "dangerSolid"} loading={pending} onClick={onConfirm}>
            {blocked ? "Unblock" : "Block"}
          </Button>
        </>
      }
    />
  );
}

/** Confirmation for removing someone from your followers: it can't be undone from here, so it asks first. */
export function RemoveFollowerDialog({
  username,
  pending,
  onConfirm,
  onClose,
}: {
  username: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Remove @${username} as a follower?`}
      description="They won't be told, and they aren't blocked. They can follow you again. If you want to stop them following for good, block them instead."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="dangerSolid" loading={pending} onClick={onConfirm}>Remove</Button>
        </>
      }
    />
  );
}
