"use client";

import { Clapperboard, Globe, Link2, Lock, MoreHorizontal, UploadCloud, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { HeroCombobox } from "@/components/upload/hero-combobox";
import { CLIP_TEXT_MAX, splitClipText } from "@/lib/clip-text";
import { CLIP_PUBLISHED_EVENT, OPEN_UPLOAD_EVENT } from "@/lib/ui-events";
import { cn } from "@/lib/utils";
import { isMp4Signature, maxClipBytes } from "@/lib/video";

type Phase = "idle" | "uploading" | "processing" | "failed";
type Visibility = "public" | "unlisted" | "private";

const visibilityMeta: Record<Visibility, { label: string; menu: string; icon: typeof Globe }> = {
  public: { label: "Public", menu: "Public · anyone can watch", icon: Globe },
  unlisted: { label: "Unlisted", menu: "Unlisted · only with the link", icon: Link2 },
  private: { label: "Private", menu: "Private · only you", icon: Lock },
};

const maxMb = Math.round(maxClipBytes() / 1_048_576);

type Initiated = {
  error?: string;
  clipId?: string;
  uploadUrl?: string;
  headers?: Record<string, string>;
  posterUploadUrl?: string | null;
  posterHeaders?: Record<string, string> | null;
};

async function capturePoster(source: File) {
  const url = URL.createObjectURL(source);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.src = url;
    await new Promise<void>((resolve) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => resolve();
    });
    video.currentTime = Math.min(0.5, video.duration || 0);
    await new Promise((resolve) => {
      video.onseeked = resolve;
      window.setTimeout(resolve, 800);
    });
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d");
    if (!context || !video.videoWidth) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Threads-style composer for new clips. One text box (first line becomes the
 * title, the rest the description), an MP4 attachment, hero tags and a
 * visibility menu. Opened from anywhere with `openUploadModal()`.
 */
export function UploadModal({
  configured,
  viewer,
}: {
  configured: boolean;
  viewer: { name: string; username: string; avatarUrl: string | null };
}) {
  const router = useRouter();
  const toast = useToast();
  const titleId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const lock = useRef(false);
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [poster, setPoster] = useState<Blob | null>(null);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [heroes, setHeroes] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [clipId, setClipId] = useState("");
  const [dragging, setDragging] = useState(false);

  const busy = phase === "uploading" || phase === "processing";
  const { title } = splitClipText(text);
  const dirty = Boolean(file || text.trim() || heroes.length);
  const canPost = Boolean(file) && title.length > 0 && !busy;

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_UPLOAD_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_UPLOAD_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function reset() {
    setFile(null);
    setPreview("");
    setPoster(null);
    setText("");
    setVisibility("public");
    setHeroes([]);
    setProgress(0);
    setError("");
    setClipId("");
    setPhase("idle");
  }

  function requestClose() {
    if (busy || dirty) setConfirmDiscard(true);
    else setOpen(false);
  }

  async function discard() {
    setConfirmDiscard(false);
    if (busy) await cancelUpload();
    reset();
    setOpen(false);
  }

  async function choose(next: File | null) {
    setError("");
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".mp4") || (next.type && next.type !== "video/mp4")) {
      setError("Only MP4 videos are accepted.");
      return;
    }
    if (next.size > maxClipBytes()) {
      setError(`Video must be ${maxMb} MB or smaller.`);
      return;
    }
    const header = new Uint8Array(await next.slice(0, 12).arrayBuffer());
    if (!isMp4Signature(header)) {
      setError("That file does not look like an MP4.");
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setPoster(await capturePoster(next));
    setPhase("idle");
  }

  function removeFile() {
    setFile(null);
    setPreview("");
    setPoster(null);
  }

  function uploadBlob(url: string, blob: Blob, headers: Record<string, string>, onProgress?: (value: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      xhr.current = request;
      request.open("PUT", url);
      Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
      request.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
      };
      request.onload = () => (request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("Upload failed.")));
      request.onerror = () => reject(new Error("Upload failed."));
      request.onabort = () => reject(new Error("Upload cancelled."));
      request.send(blob);
    });
  }

  async function post() {
    if (!file || lock.current) return;
    const split = splitClipText(text);
    if (!split.title) {
      setError("Write a caption for your clip.");
      return;
    }
    lock.current = true;
    setPhase("uploading");
    setError("");
    setProgress(0);
    let startedId = "";
    try {
      const initiated = await fetch("/api/clips/upload/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: split.title,
          description: split.description,
          heroTags: heroes,
          visibility,
          fileSize: file.size,
          mimeType: "video/mp4",
          fileName: file.name,
          posterSize: poster?.size,
        }),
      });
      const body = (await initiated.json()) as Initiated;
      if (!initiated.ok || !body.clipId || !body.uploadUrl || !body.headers) throw new Error(body.error ?? "Could not start the upload.");
      startedId = body.clipId;
      setClipId(body.clipId);
      await uploadBlob(body.uploadUrl, file, body.headers, setProgress);
      if (poster && body.posterUploadUrl && body.posterHeaders) {
        await uploadBlob(body.posterUploadUrl, poster, body.posterHeaders);
      }
      setPhase("processing");
      const completed = await fetch("/api/clips/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId: body.clipId, posterUploaded: Boolean(poster && body.posterUploadUrl) }),
      });
      const done = (await completed.json()) as { error?: string };
      if (!completed.ok) throw new Error(done.error ?? "Could not publish the clip.");

      toast("Your clip is live.", "default", { label: "View", href: `/clip/${body.clipId}` });
      reset();
      setOpen(false);
      window.dispatchEvent(new Event(CLIP_PUBLISHED_EVENT));
      router.refresh();
    } catch (caught) {
      if (startedId && !(caught instanceof Error && caught.message === "Upload cancelled.")) {
        await fetch("/api/clips/upload/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clipId: startedId }),
        }).catch(() => undefined);
      }
      setPhase("failed");
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      lock.current = false;
      xhr.current = null;
    }
  }

  async function cancelUpload() {
    xhr.current?.abort();
    if (clipId) {
      await fetch("/api/clips/upload/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipId }),
      }).catch(() => undefined);
    }
    setPhase("idle");
    setProgress(0);
  }

  const VisibilityIcon = visibilityMeta[visibility].icon;
  const pct = Math.round(progress * 100);

  return (
    <>
      <Modal open={open} onRequestClose={requestClose} labelledBy={titleId}>
        <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-3">
          <div>
            <button type="button" onClick={requestClose} className="rounded-full px-3 py-2 text-[15px] hover:bg-hover">
              Cancel
            </button>
          </div>
          <h2 id={titleId} className="text-base font-bold">New clip</h2>
          <div className="flex justify-end">
            <ActionMenu
              label="Clip options"
              items={(Object.keys(visibilityMeta) as Visibility[]).map((value) => ({
                label: visibilityMeta[value].menu,
                icon: visibilityMeta[value].icon,
                checked: visibility === value,
                onSelect: () => setVisibility(value),
              }))}
              buttonClassName="flex h-10 w-10 items-center justify-center rounded-full hover:bg-hover"
            >
              <MoreHorizontal aria-hidden="true" className="h-6 w-6" />
            </ActionMenu>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {!configured ? (
            <p className="mb-4 rounded-xl bg-card p-4 text-sm leading-6 text-muted">
              Uploads are not available yet because video storage has not been set up.
            </p>
          ) : null}
          <form
            id="clip-composer"
            className="grid grid-cols-[2.5rem_1fr] gap-x-3"
            onSubmit={(event) => {
              event.preventDefault();
              void post();
            }}
          >
            <Avatar src={viewer.avatarUrl} name={viewer.name} size={40} />
            <fieldset disabled={busy || !configured} className="min-w-0 space-y-4">
              <div>
                <p className="flex items-center gap-1.5 text-[15px] font-semibold">
                  {viewer.username}
                  <span className="flex items-center gap-1 text-xs font-normal text-muted">
                    <VisibilityIcon aria-hidden="true" className="h-3 w-3" /> {visibilityMeta[visibility].label}
                  </span>
                </p>
                <label htmlFor={`${titleId}-text`} className="sr-only">Caption</label>
                <textarea
                  id={`${titleId}-text`}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={CLIP_TEXT_MAX}
                  rows={2}
                  placeholder="What's your highlight? The first line is the headline."
                  className="mt-0.5 block min-h-14 w-full resize-none bg-transparent text-[15px] leading-6 outline-none [field-sizing:content] placeholder:text-muted"
                  autoFocus
                />
                {text.length > CLIP_TEXT_MAX - 150 ? (
                  <p className="text-xs tabular-nums text-muted" aria-live="polite">{text.length}/{CLIP_TEXT_MAX}</p>
                ) : null}
              </div>

              {file && preview ? (
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <video src={preview} controls playsInline className="aspect-video w-full" aria-label="Preview of the selected clip" />
                  <button
                    type="button"
                    onClick={removeFile}
                    aria-label="Remove video"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                  <p className="pointer-events-none absolute bottom-2 left-2 max-w-[70%] truncate rounded-full bg-black/70 px-2.5 py-1 text-xs text-white">
                    {file.name} · {(file.size / 1_048_576).toFixed(1)} MB
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    void choose(event.dataTransfer.files[0] ?? null);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                    dragging ? "border-accent-text bg-accent-soft" : "border-line-strong hover:bg-hover",
                  )}
                >
                  <UploadCloud aria-hidden="true" className="h-7 w-7 text-accent-text" />
                  <span className="text-[15px] font-semibold">Add your MP4 clip</span>
                  <span className="text-sm text-muted">Drop it here or browse · MP4 only · up to {maxMb} MB</span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="video/mp4,.mp4"
                hidden
                onChange={(event) => {
                  void choose(event.target.files?.[0] ?? null);
                  event.target.value = "";
                }}
              />

              <HeroCombobox selected={heroes} onChange={setHeroes} disabled={busy} />
            </fieldset>
          </form>

          {error ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger" role="alert">
              <Clapperboard aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>

        <footer className="shrink-0 border-t px-4 py-3">
          {busy ? (
            <div className="mb-3">
              <div
                role="progressbar"
                aria-label="Upload progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={phase === "processing" ? 100 : pct}
                className="h-1.5 overflow-hidden rounded-full bg-card"
              >
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${phase === "processing" ? 100 : pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted" aria-live="polite">
                {phase === "processing" ? "Checking the upload…" : `${pct}% uploaded. Keep this tab open.`}
              </p>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {!file ? "Add a clip to post" : !title ? "Add a caption to post" : visibilityMeta[visibility].menu}
            </p>
            <div className="flex items-center gap-2">
              {phase === "uploading" ? (
                <Button variant="ghost" onClick={() => void cancelUpload()}>Stop</Button>
              ) : null}
              <Button type="submit" form="clip-composer" disabled={!canPost} loading={busy}>
                {busy ? "Posting…" : phase === "failed" ? "Retry" : "Post"}
              </Button>
            </div>
          </div>
        </footer>
      </Modal>

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={busy ? "Stop uploading?" : "Discard clip?"}
        description={busy ? "Your upload will be cancelled and nothing will be posted." : "Your video and caption will be lost."}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
            <Button variant="dangerSolid" onClick={() => void discard()}>{busy ? "Stop upload" : "Discard"}</Button>
          </>
        }
      />
    </>
  );
}
