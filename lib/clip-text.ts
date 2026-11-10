export const TITLE_MAX = 120;
export const CLIP_TEXT_MAX = 1000;

/**
 * The composer has a single text box, but clips store a title and a
 * description. The first line is the headline (up to 120 characters, cut at a
 * word boundary); anything after it becomes the description.
 */
export function splitClipText(raw: string) {
  const text = raw.replace(/\r\n/g, "\n").trim();
  if (!text) return { title: "", description: "" };
  const newline = text.indexOf("\n");
  const first = (newline === -1 ? text : text.slice(0, newline)).trim();
  const rest = newline === -1 ? "" : text.slice(newline + 1).trim();
  if (first.length <= TITLE_MAX) return { title: first, description: rest };
  let cut = first.lastIndexOf(" ", TITLE_MAX);
  if (cut < TITLE_MAX / 2) cut = TITLE_MAX;
  const title = first.slice(0, cut).trim();
  const overflow = first.slice(cut).trim();
  return { title, description: [overflow, rest].filter(Boolean).join("\n") };
}

export function joinClipText(title: string, description: string) {
  return description ? `${title}\n${description}` : title;
}

/** Whether a clip can still be edited, given the server-provided deadline. */
export function editWindowMs(editableUntil: string | null | undefined, now: number) {
  if (!editableUntil) return 0;
  const left = new Date(editableUntil).getTime() - now;
  return Number.isFinite(left) && left > 0 ? left : 0;
}

export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Parses "83", "1:23" or "1:02:03" into seconds. Returns null when the text is not a timestamp. */
export function parseTimestamp(value: string) {
  const parts = value.trim().split(":");
  if (parts.length === 0 || parts.length > 3 || parts.some((part) => !/^\d{1,2}$|^\d{1,5}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.length > 1 && numbers.slice(1).some((part) => part > 59)) return null;
  const seconds = numbers.reduce((total, part) => total * 60 + part, 0);
  return seconds <= 86_400 ? seconds : null;
}

export const momentPresets = ["Double Kill", "Triple Kill", "Maniac", "Savage", "Legendary", "Lord Steal", "Turtle Steal", "Clutch"] as const;
