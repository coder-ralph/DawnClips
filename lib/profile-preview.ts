export type ProfilePreview = {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  followersCount: number | null;
  isOwn: boolean;
  following: boolean;
  signedIn: boolean;
};

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: ProfilePreview }>();
const inFlight = new Map<string, Promise<ProfilePreview | null>>();

/** "1 follower", "12 followers", "12.3K followers"; null when the person hides their count. */
export function followersLabel(count: number | null) {
  if (count === null) return null;
  const formatted = new Intl.NumberFormat("en", { notation: count > 9999 ? "compact" : "standard" }).format(count);
  return `${formatted} ${count === 1 ? "follower" : "followers"}`;
}

/** Positions the card under (or, when there is no room, above) its trigger and keeps it inside the viewport. */
export function placeCard(
  trigger: { left: number; top: number; bottom: number },
  card: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 8,
  margin = 8,
) {
  const below = trigger.bottom + gap;
  const fitsBelow = below + card.height <= viewport.height - margin;
  const above = trigger.top - gap - card.height;
  const top = fitsBelow || above < margin ? below : above;
  const left = Math.min(Math.max(trigger.left, margin), Math.max(margin, viewport.width - card.width - margin));
  return { top: Math.max(margin, Math.min(top, viewport.height - card.height - margin)), left, placement: top === below ? ("below" as const) : ("above" as const) };
}

export function cachedPreview(key: string) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

export function rememberPreview(key: string, value: ProfilePreview) {
  cache.set(key, { at: Date.now(), value });
}

/** One request per profile at a time, remembered for a minute, so moving over a name repeatedly stays cheap. */
export function loadPreview(key: string): Promise<ProfilePreview | null> {
  const cached = cachedPreview(key);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetch(`/api/profiles/${encodeURIComponent(key)}/preview`)
    .then(async (response) => {
      if (!response.ok) return null;
      const value = (await response.json().catch(() => null)) as ProfilePreview | null;
      if (value) rememberPreview(key, value);
      return value;
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}
