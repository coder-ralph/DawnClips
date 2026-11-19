/**
 * How the signed-in person relates to another profile, and the lists built from it. Shared by the server (page loaders,
 * API routes) and the client (menus, buttons, settings lists). The rules themselves live in the database
 * (supabase/schema-phase14.sql): see the header of that file for what each action affects.
 */

export type Relationship = {
  /** The viewer follows them. */
  following: boolean;
  /** They follow the viewer. */
  followedBy: boolean;
  muted: boolean;
  restricted: boolean;
  blocked: boolean;
};

export const noRelationship: Relationship = { following: false, followedBy: false, muted: false, restricted: false, blocked: false };

/** Reads the jsonb from profile_relationship (snake_case keys). Anything missing is false. */
export function parseRelationship(raw: unknown): Relationship {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    following: row.following === true,
    followedBy: row.followed_by === true,
    muted: row.muted === true,
    restricted: row.restricted === true,
    blocked: row.blocked === true,
  };
}

/** One row of a followers / following / blocked / muted / restricted list. */
export type PersonRow = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  /** Followers and following lists only: the viewer already follows this person. */
  following?: boolean;
  /** Followers and following lists only: this row is the viewer. */
  isSelf?: boolean;
};

export type PeoplePage = {
  people: PersonRow[];
  /** Opaque; pass it back to get the next page. Null on the last page. */
  nextCursor: string | null;
};

export type ProfilePeopleKind = "followers" | "following";

export function isProfilePeopleKind(value: unknown): value is ProfilePeopleKind {
  return value === "followers" || value === "following";
}

/** The three lists under Settings, each with the action that reverses it. */
export type RelationshipListKind = "blocked" | "muted" | "restricted";

export const relationshipLists: Record<
  RelationshipListKind,
  {
    title: string;
    /** Button that reverses the relationship. */
    action: string;
    /** Path segment of the API route that reverses it: /api/profiles/[id]/<endpoint>. */
    endpoint: "block" | "mute" | "restrict";
    summary: string;
    empty: string;
    explainer: string;
  }
> = {
  blocked: {
    title: "Blocked profiles",
    action: "Unblock",
    endpoint: "block",
    summary: "People who can't see or follow you",
    empty: "You haven't blocked anyone yet.",
    explainer:
      "Blocked people can't see your clips, comments or profile, can't follow you, and you won't see theirs. Blocking also ends any follows between you.",
  },
  restricted: {
    title: "Restricted profiles",
    action: "Unrestrict",
    endpoint: "restrict",
    summary: "Limit interactions without blocking or unfollowing",
    empty: "You haven't restricted anyone yet.",
    explainer:
      "Limit interactions from someone without blocking or unfollowing them. Their comments and replies on your clips are hidden from everyone but them and you, and their likes, comments and follows no longer notify you. They aren't told.",
  },
  muted: {
    title: "Muted profiles",
    action: "Unmute",
    endpoint: "mute",
    summary: "People whose clips you don't want in your feeds",
    empty: "You haven't muted anyone yet.",
    explainer:
      "Muted people's clips stay out of your feeds and suggestions. You can still follow them, visit their profile and get their notifications, and they aren't told.",
  },
};

export function isRelationshipListKind(value: unknown): value is RelationshipListKind {
  return value === "blocked" || value === "muted" || value === "restricted";
}
