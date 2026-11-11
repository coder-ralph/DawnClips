import "server-only";
import { auth } from "@clerk/nextjs/server";
import { ensureCurrentProfile } from "@/lib/profile";
import { callSocial } from "@/lib/social";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ClipDetail, ClipMoment, FeedClip, FeedCursor, FeedName } from "@/types/clips";

export function encodeCursor(cursor: FeedCursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeCursor(value: string | undefined): FeedCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<FeedCursor>;
    if (!parsed.id || !parsed.createdAt) return null;
    if (!/^[0-9a-f-]{36}$/i.test(parsed.id)) return null;
    if (Number.isNaN(new Date(parsed.createdAt).getTime())) return null;
    return {
      id: parsed.id,
      createdAt: parsed.createdAt,
      score: typeof parsed.score === "number" ? parsed.score : null,
    };
  } catch {
    return null;
  }
}

function mapFeedClip(row: Record<string, unknown>): FeedClip | null {
  if (typeof row.id !== "string" || typeof row.title !== "string") return null;
  return {
    id: row.id,
    title: row.title,
    description: String(row.description ?? ""),
    heroTags: Array.isArray(row.hero_tags) ? row.hero_tags.filter((tag) => typeof tag === "string") : [],
    duration: typeof row.duration === "number" ? row.duration : null,
    thumbnailUrl: typeof row.thumbnail_url === "string" ? row.thumbnail_url : null,
    viewsCount: Number(row.views_count ?? 0),
    likesCount: Number(row.likes_count ?? 0),
    commentsCount: Number(row.comments_count ?? 0),
    createdAt: String(row.created_at ?? ""),
    userId: String(row.user_id ?? ""),
    username: String(row.username ?? ""),
    displayName: String(row.display_name ?? ""),
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    score: typeof row.score === "number" ? row.score : null,
    editedAt: typeof row.edited_at === "string" ? row.edited_at : null,
    editableUntil: typeof row.editable_until === "string" ? row.editable_until : null,
    pinnedAt: typeof row.pinned_at === "string" ? row.pinned_at : null,
    visibility: row.visibility === "private" || row.visibility === "unlisted" ? row.visibility : "public",
    commentsMode: row.comments_mode === "followers" || row.comments_mode === "disabled" ? row.comments_mode : "everyone",
  };
}

type ViewerFlags = Record<string, { liked?: boolean; bookmarked?: boolean; following?: boolean }>;

/**
 * Turns feed-shaped RPC rows into FeedClip objects and adds viewer-specific
 * state (own clip, liked, bookmarked, following) in one extra lookup.
 */
export async function hydrateClips(rows: unknown): Promise<FeedClip[]> {
  const clips = Array.isArray(rows)
    ? rows.map((row) => mapFeedClip(row as Record<string, unknown>)).filter((row): row is FeedClip => Boolean(row))
    : [];
  if (clips.length === 0) return clips;
  const profile = await ensureCurrentProfile();
  const mine = profile.status === "ready" ? profile.profile.id : null;
  const ids = clips.map((clip) => clip.id);
  // Moment chips are a nice-to-have: a failure here never blocks the list.
  const momentsResult = await callSocial<Record<string, unknown[]>>("moments_for_clips", { ids });
  const flagged = clips.map((clip) => ({
    ...clip,
    isOwn: clip.userId === mine,
    moments: momentsResult.ok && momentsResult.data ? parseMoments(momentsResult.data[clip.id]) : [],
  }));
  if (!mine) return flagged;
  const flags = await callSocial<ViewerFlags>("viewer_clip_flags", { ids });
  if (!flags.ok || !flags.data) return flagged;
  return flagged.map((clip) => ({
    ...clip,
    liked: Boolean(flags.data[clip.id]?.liked),
    bookmarked: Boolean(flags.data[clip.id]?.bookmarked),
    following: Boolean(flags.data[clip.id]?.following),
  }));
}

export async function listFeed(feed: FeedName, cursor: FeedCursor | null) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return { status: "unconfigured" as const, clips: [] as FeedClip[], nextCursor: null };
  const { data, error } = await supabase.rpc("list_feed", {
    feed,
    cursor_at: cursor?.createdAt ?? null,
    cursor_id: cursor?.id ?? null,
    cursor_score: cursor?.score ?? null,
    page_limit: 8,
  });
  if (error) {
    console.error(`Feed query failed [${error.code ?? "no-code"}] ${error.message ?? ""}`);
    return { status: "error" as const, clips: [] as FeedClip[], nextCursor: null };
  }
  const payload = data as { clips?: unknown; next_cursor?: Record<string, unknown> | null } | null;
  const clips = await hydrateClips(payload?.clips);
  const raw = payload?.next_cursor;
  const nextCursor = raw && typeof raw.id === "string" && typeof raw.created_at === "string"
    ? encodeCursor({
        id: raw.id,
        createdAt: raw.created_at,
        score: typeof raw.score === "number" ? raw.score : null,
      })
    : null;
  return { status: "ready" as const, clips, nextCursor };
}

export async function loadClip(id: string): Promise<ClipDetail | null> {
  const admin = createAdminSupabaseClient();
  if (!admin) return null;
  const { userId } = await auth();
  const { data, error } = await admin.rpc("authorize_clip_playback", {
    target: id,
    clerk_user_id: userId,
  });
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.status !== "published") return null;
  const clip = mapFeedClip(row);
  if (!clip) return null;
  const profile = await ensureCurrentProfile();
  return {
    ...clip,
    visibility: row.visibility === "private" || row.visibility === "unlisted" ? row.visibility : "public",
    status: String(row.status),
    isOwn: profile.status === "ready" && profile.profile.id === clip.userId,
    commentsMode: row.comments_mode === "followers" || row.comments_mode === "disabled" ? row.comments_mode : "everyone",
  };
}

export async function relatedClips(id: string) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("related_clips", { target: id, page_limit: 6 });
  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => mapFeedClip({ ...(row as Record<string, unknown>), description: "", likes_count: 0, comments_count: 0 }))
    .filter((row): row is FeedClip => Boolean(row));
}

export async function trendingSidebar() {
  const supabase = createServerSupabaseClient();
  if (!supabase) return { heroes: [], creators: [] };
  const { data, error } = await supabase.rpc("trending_sidebar");
  if (error || !data || typeof data !== "object") return { heroes: [], creators: [] };
  const payload = data as { heroes?: unknown; creators?: unknown };
  const heroes = Array.isArray(payload.heroes)
    ? payload.heroes.flatMap((row) => {
        const item = row as { hero_id?: string; clip_count?: number };
        return item.hero_id ? [{ id: item.hero_id, count: Number(item.clip_count ?? 0) }] : [];
      })
    : [];
  const creators = Array.isArray(payload.creators)
    ? payload.creators.flatMap((row) => {
        const item = row as { username?: string; display_name?: string; avatar_url?: string | null; clip_count?: number };
        return item.username
          ? [{
              username: item.username,
              displayName: item.display_name ?? item.username,
              avatarUrl: item.avatar_url ?? null,
              count: Number(item.clip_count ?? 0),
            }]
          : [];
      })
    : [];
  return { heroes, creators };
}

/** Saved clips as full feed rows so they can be played in place. */
export async function listSavedClips(limit = 30) {
  const result = await callSocial<unknown[]>("list_saved_clips", { page_limit: limit });
  if (!result.ok) return { ok: false as const, clips: [] as FeedClip[] };
  const clips = await hydrateClips(result.data);
  // Everything on this page is saved by definition, whatever the viewer-flags lookup returned.
  return { ok: true as const, clips: clips.map((clip) => ({ ...clip, bookmarked: true })) };
}

/** Highlights (pinned first) or liked clips for a profile, as full feed rows. */
export async function listProfileFeed(profileId: string, tab: "highlights" | "liked", limit = 24) {
  const result = await callSocial<unknown[]>("profile_clips", { target: profileId, tab, page_limit: limit });
  if (!result.ok) return { ok: false as const, clips: [] as FeedClip[] };
  return { ok: true as const, clips: await hydrateClips(result.data) };
}

export type ExplorePlayer = { id: string; username: string; displayName: string; avatarUrl: string | null; bio: string };

/** One search across clips and players. `tags` are hero ids resolved from the query on the client/server. */
export async function exploreSearch(query: string, tags: string[]) {
  const result = await callSocial<{ clips?: unknown; players?: unknown[] }>("explore_search", {
    query: query || null,
    tags,
    page_limit: 18,
  });
  if (!result.ok) return { ok: false as const, clips: [] as FeedClip[], players: [] as ExplorePlayer[] };
  const players = Array.isArray(result.data?.players)
    ? result.data.players.flatMap((row) => {
        const item = row as Record<string, unknown>;
        return typeof item.id === "string" && typeof item.username === "string"
          ? [{
              id: item.id,
              username: item.username,
              displayName: String(item.display_name ?? item.username),
              avatarUrl: typeof item.avatar_url === "string" ? item.avatar_url : null,
              bio: String(item.bio ?? ""),
            }]
          : [];
      })
    : [];
  return { ok: true as const, clips: await hydrateClips(result.data?.clips), players };
}

function parseMoments(rows: unknown): ClipMoment[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    const item = row as Record<string, unknown>;
    return typeof item.id === "string" && typeof item.at === "number" && typeof item.label === "string"
      ? [{ id: item.id, at: item.at, label: item.label }]
      : [];
  });
}

export async function listMoments(clipId: string): Promise<ClipMoment[]> {
  const result = await callSocial<unknown[]>("list_clip_moments", { target: clipId });
  return result.ok ? parseMoments(result.data) : [];
}

/** A public, published clip for the embeddable player. Never returns unlisted or private clips. */
export async function loadEmbedClip(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const admin = createAdminSupabaseClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc("authorize_clip_playback", { target: id, clerk_user_id: null });
  if (error || !data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.status !== "published" || row.visibility !== "public") return null;
  const clip = mapFeedClip(row);
  return clip ? { id: clip.id, title: clip.title, username: clip.username, displayName: clip.displayName, thumbnailUrl: clip.thumbnailUrl } : null;
}
