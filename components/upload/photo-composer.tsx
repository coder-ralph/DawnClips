"use client";

import { ArrowLeft, ArrowRight, Globe, ImagePlus, Link2, Loader2, Lock, MoreHorizontal, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { HeroCombobox } from "@/components/upload/hero-combobox";
import { CLIP_TEXT_MAX } from "@/lib/clip-text";
import { photoPrepare, prepareImage } from "@/lib/image-prepare";
import { PHOTO_POST_MAX_IMAGES, PHOTO_POST_MAX_TOTAL_BYTES } from "@/lib/media";
import { CLIP_PUBLISHED_EVENT, OPEN_PHOTO_COMPOSER_EVENT } from "@/lib/ui-events";
import { cn } from "@/lib/utils";

type Phase = "idle" | "preparing" | "uploading" | "verifying" | "failed";
type Visibility = "public" | "unlisted" | "private";
type ItemState = "ready" | "uploading" | "done" | "failed";

type Item = {
  key: number;
  file: File;
  mime: string;
  width: number;
  height: number;
  preview: string;
  state: ItemState;
  progress: number;
};

const visibilityMeta: Record<Visibility, { label: string; menu: string; icon: typeof Globe }> = {
  public: { label: "Public", menu: "Public · anyone can see", icon: Globe },
  unlisted: { label: "Unlisted", menu: "Unlisted · only with the link", icon: Link2 },
  private: { label: "Private", menu: "Private · only you", icon: Lock },
};

type Initiated = { error?: string; postId?: string; uploads?: Array<{ id: string; position: number; uploadUrl: string; headers: Record<string, string> }> };

let nextKey = 0;
const CONCURRENCY = 3;

/**
 * Composer for a photo post: pick up to 20 JPEG, PNG or WebP photos, reorder or remove them, add an optional caption.
 * Large photos are shrunk in the browser first (lib/image-prepare.ts). Posting asks the server to start the post, uploads
 * each photo straight to storage with a presigned URL, then asks the server to check and publish. If anything fails the
 * server deletes whatever was uploaded and nothing is posted.
 */
export function PhotoComposer({
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
  const requests = useRef(new Set<XMLHttpRequest>());
  const aborted = useRef(false);
  const lock = useRef(false);
  const itemsRef = useRef<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [heroes, setHeroes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [postId, setPostId] = useState("");
  const [dragging, setDragging] = useState(false);

  const busy = phase === "uploading" || phase === "verifying";
  const working = busy || phase === "preparing";
  const dirty = items.length > 0 || Boolean(text.trim()) || heroes.length > 0;
  const totalBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const canPost = items.length > 0 && !working && configured;
  const overall = totalBytes > 0 ? items.reduce((sum, item) => sum + item.file.size * (item.state === "done" ? 1 : item.progress), 0) / totalBytes : 0;
  const pct = Math.round(overall * 100);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_PHOTO_COMPOSER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_PHOTO_COMPOSER_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.preview);
    };
  }, []);

  function reset() {
    for (const item of itemsRef.current) URL.revokeObjectURL(item.preview);
    setItems([]);
    setText("");
    setVisibility("public");
    setHeroes([]);
    setError("");
    setNotes([]);
    setPostId("");
    setPhase("idle");
  }

  function requestClose() {
    if (working || dirty) setConfirmDiscard(true);
    else setOpen(false);
  }

  async function discard() {
    setConfirmDiscard(false);
    if (busy) await stopUpload();
    reset();
    setOpen(false);
  }

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    if (files.length === 0 || working) return;
    setError("");
    const room = PHOTO_POST_MAX_IMAGES - items.length;
    const problems: string[] = [];
    if (files.length > room) problems.push(`A post can have up to ${PHOTO_POST_MAX_IMAGES} photos. ${Math.max(room, 0)} more can be added.`);
    const chosen = files.slice(0, Math.max(room, 0));
    setPhase("preparing");
    const added: Item[] = [];
    let running = items.reduce((sum, item) => sum + item.file.size, 0);
    for (const file of chosen) {
      const prepared = await prepareImage(file, photoPrepare);
      if (!prepared.ok) {
        problems.push(`${file.name}: ${prepared.error}`);
        continue;
      }
      if (running + prepared.image.file.size > PHOTO_POST_MAX_TOTAL_BYTES) {
        problems.push(`${file.name}: the photos in one post can total up to ${Math.round(PHOTO_POST_MAX_TOTAL_BYTES / 1_048_576)} MB.`);
        continue;
      }
      running += prepared.image.file.size;
      added.push({
        key: ++nextKey,
        file: prepared.image.file,
        mime: prepared.image.mime,
        width: prepared.image.width,
        height: prepared.image.height,
        preview: URL.createObjectURL(prepared.image.file),
        state: "ready",
        progress: 0,
      });
    }
    setItems((current) => [...current, ...added]);
    setNotes(problems);
    setPhase("idle");
  }

  function removeItem(key: number) {
    setItems((current) => {
      const target = current.find((item) => item.key === key);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.key !== key);
    });
  }

  function move(key: number, direction: -1 | 1) {
    setItems((current) => {
      const index = current.findIndex((item) => item.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function patchItem(key: number, patch: Partial<Item>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function uploadFile(item: Item, url: string, headers: Record<string, string>) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      requests.current.add(request);
      request.open("PUT", url);
      Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) patchItem(item.key, { progress: event.loaded / event.total });
      };
      request.onload = () => {
        requests.current.delete(request);
        if (request.status >= 200 && request.status < 300) resolve();
        else reject(new Error("upload"));
      };
      request.onerror = () => {
        requests.current.delete(request);
        reject(new Error("upload"));
      };
      request.onabort = () => {
        requests.current.delete(request);
        reject(new Error("cancelled"));
      };
      request.send(item.file);
    });
  }

  async function cancelPost(id: string) {
    await fetch("/api/posts/upload/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId: id }),
    }).catch(() => undefined);
  }

  async function post() {
    if (lock.current || items.length === 0) return;
    lock.current = true;
    aborted.current = false;
    setError("");
    setNotes([]);
    setPhase("uploading");
    setItems((current) => current.map((item) => ({ ...item, state: "ready", progress: 0 })));
    let startedId = "";
    try {
      const initiated = await fetch("/api/posts/upload/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption: text,
          heroTags: heroes,
          visibility,
          files: items.map((item) => ({ mimeType: item.mime, size: item.file.size, width: item.width, height: item.height })),
        }),
      });
      const body = (await initiated.json().catch(() => ({}))) as Initiated;
      if (!initiated.ok || !body.postId || !body.uploads || body.uploads.length !== items.length) {
        throw new Error(body.error ?? "Could not start the upload.");
      }
      startedId = body.postId;
      setPostId(body.postId);

      // The server answered in the order of the photos: upload n belongs to photo n.
      const queue = items.map((item, index) => ({ item, upload: body.uploads![index] }));
      let failure: Error | null = null;
      const worker = async () => {
        for (;;) {
          if (failure || aborted.current) return;
          const next = queue.shift();
          if (!next) return;
          patchItem(next.item.key, { state: "uploading" });
          try {
            await uploadFile(next.item, next.upload.uploadUrl, next.upload.headers);
            patchItem(next.item.key, { state: "done", progress: 1 });
          } catch (caught) {
            patchItem(next.item.key, { state: "failed" });
            failure = failure ?? (caught instanceof Error ? caught : new Error("upload"));
            for (const request of requests.current) request.abort();
            return;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
      if (aborted.current) throw new Error("cancelled");
      if (failure) throw new Error("One of the photos could not be uploaded. Nothing was posted. Check your connection and try again.");

      setPhase("verifying");
      const completed = await fetch("/api/posts/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: body.postId }),
      });
      const done = (await completed.json().catch(() => ({}))) as { error?: string };
      if (!completed.ok) throw new Error(done.error ?? "Could not publish the post.");

      toast("Your photos are live.", "default", { label: "View", href: `/clip/${body.postId}` });
      reset();
      setOpen(false);
      window.dispatchEvent(new Event(CLIP_PUBLISHED_EVENT));
      router.refresh();
    } catch (caught) {
      const cancelled = caught instanceof Error && caught.message === "cancelled";
      // Whatever was uploaded is deleted by the server; a retry starts a new post.
      if (startedId) await cancelPost(startedId);
      setPostId("");
      setItems((current) => current.map((item) => ({ ...item, state: "ready", progress: 0 })));
      setPhase(cancelled ? "idle" : "failed");
      if (!cancelled) setError(caught instanceof Error && caught.message !== "upload" ? caught.message : "Upload failed. Nothing was posted.");
    } finally {
      lock.current = false;
      requests.current.clear();
    }
  }

  async function stopUpload() {
    aborted.current = true;
    for (const request of requests.current) request.abort();
    // The running post() sees the abort, cancels the post on the server and resets the photos.
    if (!lock.current && postId) await cancelPost(postId);
  }

  const VisibilityIcon = visibilityMeta[visibility].icon;

  return (
    <>
      <Modal open={open} onRequestClose={requestClose} labelledBy={titleId}>
        <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b px-3">
          <div>
            <button type="button" onClick={requestClose} className="rounded-full px-3 py-2 text-[15px] hover:bg-hover">
              Cancel
            </button>
          </div>
          <h2 id={titleId} className="text-base font-bold">New photo post</h2>
          <div className="flex justify-end">
            <ActionMenu
              label="Post options"
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
              Photo posts are not available yet because storage has not been set up.
            </p>
          ) : null}
          <form
            id="photo-composer"
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
                <label htmlFor={`${titleId}-text`} className="sr-only">Caption (optional)</label>
                <textarea
                  id={`${titleId}-text`}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={CLIP_TEXT_MAX}
                  rows={2}
                  placeholder="Add a caption (optional)"
                  className="mt-0.5 block min-h-14 w-full resize-none bg-transparent text-[15px] leading-6 outline-none [field-sizing:content] placeholder:text-muted"
                  autoFocus
                />
                {text.length > CLIP_TEXT_MAX - 150 ? (
                  <p className="text-xs tabular-nums text-muted" aria-live="polite">{text.length}/{CLIP_TEXT_MAX}</p>
                ) : null}
              </div>

              {items.length > 0 ? (
                <div>
                  <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label="Selected photos">
                    {items.map((item, index) => (
                      <li key={item.key} className="relative aspect-square overflow-hidden rounded-lg bg-card" data-testid="photo-item">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.preview} alt={`Photo ${index + 1}`} className="h-full w-full object-cover" />
                        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-medium tabular-nums text-white">
                          {index === 0 ? "Cover" : index + 1}
                        </span>
                        {item.state === "failed" ? (
                          <span className="absolute inset-0 flex items-center justify-center bg-danger-soft/80 text-danger">
                            <TriangleAlert aria-label="Upload failed" className="h-6 w-6" />
                          </span>
                        ) : null}
                        {item.state === "uploading" || item.state === "done" ? (
                          <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                            <span className="block h-full bg-accent transition-[width]" style={{ width: `${Math.round((item.state === "done" ? 1 : item.progress) * 100)}%` }} />
                          </span>
                        ) : null}
                        {!busy ? (
                          <>
                            <button
                              type="button"
                              onClick={() => removeItem(item.key)}
                              aria-label={`Remove photo ${index + 1}`}
                              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
                            >
                              <X aria-hidden="true" className="h-4 w-4" />
                            </button>
                            <span className="absolute inset-x-1 bottom-1.5 flex justify-between">
                              <button
                                type="button"
                                onClick={() => move(item.key, -1)}
                                disabled={index === 0}
                                aria-label={`Move photo ${index + 1} earlier`}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black disabled:invisible"
                              >
                                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => move(item.key, 1)}
                                disabled={index === items.length - 1}
                                aria-label={`Move photo ${index + 1} later`}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black disabled:invisible"
                              >
                                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                              </button>
                            </span>
                          </>
                        ) : null}
                      </li>
                    ))}
                    {items.length < PHOTO_POST_MAX_IMAGES ? (
                      <li>
                        <button
                          type="button"
                          onClick={() => fileInput.current?.click()}
                          disabled={working}
                          aria-label="Add more photos"
                          className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-line-strong text-accent-text hover:bg-hover disabled:opacity-50"
                        >
                          {phase === "preparing" ? <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" /> : <ImagePlus aria-hidden="true" className="h-6 w-6" />}
                        </button>
                      </li>
                    ) : null}
                  </ul>
                  <p className="mt-2 text-xs text-muted" aria-live="polite">
                    {items.length}/{PHOTO_POST_MAX_IMAGES} photos · {(totalBytes / 1_048_576).toFixed(1)} MB · The first photo is the cover. Each photo keeps its own shape.
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
                    void addFiles(event.dataTransfer.files);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                    dragging ? "border-accent-text bg-accent-soft" : "border-line-strong hover:bg-hover",
                  )}
                >
                  {phase === "preparing" ? <Loader2 aria-hidden="true" className="h-7 w-7 animate-spin text-accent-text" /> : <ImagePlus aria-hidden="true" className="h-7 w-7 text-accent-text" />}
                  <span className="text-[15px] font-semibold">Add photos</span>
                  <span className="text-sm text-muted">Drop them here or browse · JPEG, PNG or WebP · up to {PHOTO_POST_MAX_IMAGES} photos</span>
                  <span className="text-xs text-muted">Tip: 4:5 (1080 × 1350) is a good shape, but any shape works.</span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files) void addFiles(event.target.files);
                  event.target.value = "";
                }}
              />

              <HeroCombobox selected={heroes} onChange={setHeroes} disabled={busy} />
            </fieldset>
          </form>

          {notes.length > 0 ? (
            <ul className="mt-4 space-y-1 rounded-xl bg-card px-3.5 py-3 text-sm text-muted" role="status">
              {notes.slice(0, 5).map((note) => (
                <li key={note}>{note}</li>
              ))}
              {notes.length > 5 ? <li>And {notes.length - 5} more could not be added.</li> : null}
            </ul>
          ) : null}
          {error ? (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-danger" role="alert">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
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
                aria-valuenow={phase === "verifying" ? 100 : pct}
                className="h-1.5 overflow-hidden rounded-full bg-card"
              >
                <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${phase === "verifying" ? 100 : pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-muted" aria-live="polite">
                {phase === "verifying" ? "Checking the photos…" : `${pct}% uploaded. Keep this tab open.`}
              </p>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted">{items.length === 0 ? "Add photos to post" : visibilityMeta[visibility].menu}</p>
            <div className="flex items-center gap-2">
              {phase === "uploading" ? (
                <Button variant="ghost" onClick={() => void stopUpload()}>Stop</Button>
              ) : null}
              <Button type="submit" form="photo-composer" disabled={!canPost} loading={busy}>
                {busy ? "Posting…" : phase === "failed" ? "Retry" : "Post"}
              </Button>
            </div>
          </div>
        </footer>
      </Modal>

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title={busy ? "Stop uploading?" : "Discard post?"}
        description={busy ? "Your upload will be cancelled and nothing will be posted." : "Your photos and caption will be lost."}
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
