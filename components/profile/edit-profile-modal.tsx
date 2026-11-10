"use client";

import { useUser } from "@clerk/nextjs";
import { Camera, Info } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { updateProfile, type ProfileActionState } from "@/app/(main)/settings/actions";
import { ActionMenu } from "@/components/ui/action-menu";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { countries } from "@/lib/validations/profile";

export type EditableProfile = {
  displayName: string;
  username: string;
  bio: string;
  roleId: string | null;
  zoneId: string | null;
  country: string;
  avatarUrl: string | null;
};

const idsTooltip = "ML role id is public to your profile, zone id is private/hidden.";
const maxPictureBytes = 10 * 1024 * 1024;
const pictureTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const initialState: ProfileActionState = { status: "idle" };

/** Info icon with a tooltip that opens on hover, keyboard focus and tap. */
function InfoTip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label="About Role ID and Zone ID"
        aria-describedby={id}
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-foreground"
      >
        <Info aria-hidden="true" className="h-4 w-4" />
      </button>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className="absolute bottom-full right-0 z-10 mb-1 w-60 rounded-lg bg-foreground px-3 py-2 text-xs leading-5 text-background shadow-lg"
      >
        {text}
      </span>
    </span>
  );
}

function PictureControls({ profile, onChanged }: { profile: EditableProfile; onChanged: (url: string | null) => void }) {
  const { user } = useUser();
  const toast = useToast();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasPicture = Boolean(profile.avatarUrl) && Boolean(user?.hasImage);

  async function syncProfile() {
    const response = await fetch("/api/profile/avatar", { method: "POST" });
    const body = (await response.json().catch(() => null)) as { avatarUrl?: string | null; error?: string } | null;
    if (!response.ok) throw new Error(body?.error ?? "Could not update your picture.");
    onChanged(body?.avatarUrl ?? null);
    router.refresh();
  }

  async function upload(file: File) {
    setError("");
    if (!pictureTypes.includes(file.type)) return setError("Use a JPG, PNG, WebP or GIF image.");
    if (file.size > maxPictureBytes) return setError("The picture must be 10 MB or smaller.");
    if (!user) return setError("Your session is still loading. Try again in a moment.");
    setBusy(true);
    try {
      await user.setProfileImage({ file });
      await syncProfile();
      toast("Picture updated");
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Could not upload the picture.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!user) return;
    setError("");
    setBusy(true);
    try {
      await user.setProfileImage({ file: null });
      await syncProfile();
      toast("Picture removed");
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Could not remove the picture.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar src={profile.avatarUrl} name={profile.displayName} size={72} />
      <div className="min-w-0">
        <input
          ref={input}
          type="file"
          accept={pictureTypes.join(",")}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void upload(file);
          }}
        />
        <ActionMenu
          label="Change picture"
          align="start"
          items={[
            { label: "Upload picture", onSelect: () => input.current?.click(), disabled: busy },
            ...(hasPicture ? [{ label: "Remove current picture", onSelect: () => void remove(), danger: true, disabled: busy }] : []),
          ]}
          buttonClassName="inline-flex h-9 items-center gap-2 rounded-full border border-line-strong px-4 text-sm font-semibold hover:bg-hover"
        >
          <Camera aria-hidden="true" className="h-4 w-4" />
          {busy ? "Working…" : "Change picture"}
        </ActionMenu>
        <p className="mt-1.5 text-xs text-muted">JPG, PNG, WebP or GIF, up to 10 MB.</p>
        {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
    </div>
  );
}

/**
 * Edit profile as its own modal, separate from the read-only Public profile
 * summary in Settings. Left Cancel, centered title, right Save.
 */
export function EditProfileModal({
  open,
  onClose,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  /** Own profile fields. When missing, they are loaded when the modal opens. */
  initial?: EditableProfile | null;
}) {
  const titleId = useId();
  const [loaded, setLoaded] = useState<EditableProfile | null>(initial ?? null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!open || loaded) return;
    const controller = new AbortController();
    fetch("/api/profile/me", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { profile?: EditableProfile } | null;
        if (!response.ok || !body?.profile) throw new Error("load");
        setLoaded(body.profile);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setLoadError("Could not load your profile.");
      });
    return () => controller.abort();
  }, [open, loaded]);

  return (
    <Modal open={open} onRequestClose={onClose} labelledBy={titleId}>
      {loaded ? (
        <EditForm key={loaded.username} titleId={titleId} profile={loaded} onProfileChange={setLoaded} onClose={onClose} />
      ) : (
        <>
          <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-3">
            <div><button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-[15px] hover:bg-hover">Cancel</button></div>
            <h2 id={titleId} className="text-base font-bold">Edit profile</h2>
            <div />
          </header>
          <div className="px-4 py-10 text-center text-sm text-muted" role={loadError ? "alert" : "status"}>{loadError || "Loading…"}</div>
        </>
      )}
    </Modal>
  );
}

function EditForm({
  titleId,
  profile,
  onProfileChange,
  onClose,
}: {
  titleId: string;
  profile: EditableProfile;
  onProfileChange: (profile: EditableProfile) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [state, action, pending] = useActionState(updateProfile, initialState);
  const handled = useRef<ProfileActionState>(initialState);

  useEffect(() => {
    if (state === handled.current || state.status !== "success") return;
    handled.current = state;
    toast("Profile saved");
    onClose();
    // A new username changes the profile link; follow it if we are on the old one.
    if (pathname.startsWith("/profile/") && pathname !== `/profile/${state.username}`) router.replace(`/profile/${state.username}`);
    else router.refresh();
  }, [state, toast, onClose, pathname, router]);

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-3">
        <div><button type="button" onClick={onClose} className="rounded-full px-3 py-2 text-[15px] hover:bg-hover">Cancel</button></div>
        <h2 id={titleId} className="text-base font-bold">Edit profile</h2>
        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={pending}>Save</Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <PictureControls profile={profile} onChanged={(avatarUrl) => onProfileChange({ ...profile, avatarUrl })} />
        <Field label="Display name" counter="max 40">
          <input name="displayName" defaultValue={profile.displayName} maxLength={40} required className={inputClass} />
        </Field>
        <Field label="Username" hint="Letters, numbers and underscores. Changing it changes your profile link.">
          <input name="username" defaultValue={profile.username} maxLength={20} pattern="[A-Za-z0-9_]+" autoCapitalize="none" autoCorrect="off" className={inputClass} />
        </Field>
        <Field label="Bio" counter="max 160">
          <textarea name="bio" defaultValue={profile.bio} maxLength={160} rows={3} className={inputClass} />
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-medium">Mobile Legends IDs <span className="font-normal text-muted">(optional)</span></span>
            <InfoTip text={idsTooltip} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-muted">Role ID · public</span>
              <input name="roleId" defaultValue={profile.roleId ?? ""} inputMode="numeric" maxLength={12} className={`${inputClass} mt-1`} />
            </label>
            <label className="block">
              <span className="text-xs text-muted">Zone ID · private</span>
              <input name="zoneId" defaultValue={profile.zoneId ?? ""} inputMode="numeric" maxLength={8} className={`${inputClass} mt-1`} />
            </label>
          </div>
        </div>
        <Field label="Country">
          <select name="country" defaultValue={profile.country} className={inputClass}>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>{country.label}</option>
            ))}
          </select>
        </Field>
        {state.status === "error" ? <p role="alert" className="text-sm text-danger">{state.message}</p> : null}
      </div>
    </form>
  );
}
