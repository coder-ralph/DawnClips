"use client";

import { useCallback, useState } from "react";
import { EditProfileModal, type EditableProfile } from "@/components/profile/edit-profile-modal";
import { Button } from "@/components/ui/button";

/** "Edit profile" button that opens the Edit profile modal. */
export function EditProfileLauncher({
  initial,
  variant = "secondary",
  fullWidth = true,
}: {
  initial?: EditableProfile | null;
  variant?: "secondary" | "primary";
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button variant={variant} fullWidth={fullWidth} onClick={() => setOpen(true)}>Edit profile</Button>
      <EditProfileModal open={open} onClose={close} initial={initial} />
    </>
  );
}
