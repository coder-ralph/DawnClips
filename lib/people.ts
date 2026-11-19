import "server-only";
import { callSocial } from "@/lib/social";
import type { PeoplePage, PersonRow, ProfilePeopleKind, RelationshipListKind } from "@/lib/relationships";

const pageSize = 30;

type RawPerson = {
  id?: unknown;
  username?: unknown;
  display_name?: unknown;
  avatar_url?: unknown;
  following?: unknown;
  is_self?: unknown;
};
type RawPage = { people?: RawPerson[]; next_cursor?: { created_at?: unknown; id?: unknown } | null };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function encodeCursor(raw: RawPage["next_cursor"]): string | null {
  if (!raw || typeof raw.created_at !== "string" || typeof raw.id !== "string") return null;
  return Buffer.from(JSON.stringify({ at: raw.created_at, id: raw.id })).toString("base64url");
}

/** Null for no cursor; "invalid" when one was sent but is not one we made. */
function decodeCursor(cursor: string | null | undefined): { at: string; id: string } | null | "invalid" {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { at?: unknown; id?: unknown };
    if (typeof value.at === "string" && !Number.isNaN(Date.parse(value.at)) && isUuid(value.id)) return { at: value.at, id: value.id };
  } catch {
    // fall through
  }
  return "invalid";
}

function mapPage(raw: unknown, withFollowState: boolean): PeoplePage {
  const page = (raw && typeof raw === "object" ? raw : {}) as RawPage;
  const people: PersonRow[] = [];
  for (const item of Array.isArray(page.people) ? page.people : []) {
    if (!isUuid(item.id) || typeof item.username !== "string") continue;
    people.push({
      id: item.id,
      username: item.username,
      displayName: typeof item.display_name === "string" && item.display_name ? item.display_name : item.username,
      avatarUrl: typeof item.avatar_url === "string" ? item.avatar_url : null,
      ...(withFollowState ? { following: item.following === true, isSelf: item.is_self === true } : {}),
    });
  }
  return { people, nextCursor: encodeCursor(page.next_cursor) };
}

export type PeopleResult = { ok: true; page: PeoplePage } | { ok: false; status: number; error: string };

/** One page of a profile's followers or following (30 per page), newest first, with the viewer's own follow state. */
export async function fetchProfilePeople(profileId: string, kind: ProfilePeopleKind, cursor?: string | null): Promise<PeopleResult> {
  const decoded = decodeCursor(cursor);
  if (decoded === "invalid") return { ok: false, status: 400, error: "Invalid cursor." };
  const result = await callSocial<unknown>("list_profile_people", {
    target: profileId,
    list_kind: kind,
    cursor_at: decoded?.at ?? null,
    cursor_id: decoded?.id ?? null,
    page_limit: pageSize,
  });
  if (!result.ok) return result;
  return { ok: true, page: mapPage(result.data, true) };
}

/** One page of the signed-in person's own blocked, muted or restricted profiles. */
export async function fetchRelationshipProfiles(kind: RelationshipListKind, cursor?: string | null): Promise<PeopleResult> {
  const decoded = decodeCursor(cursor);
  if (decoded === "invalid") return { ok: false, status: 400, error: "Invalid cursor." };
  const result = await callSocial<unknown>("list_relationship_profiles", {
    list_kind: kind,
    cursor_at: decoded?.at ?? null,
    cursor_id: decoded?.id ?? null,
    page_limit: pageSize,
  });
  if (!result.ok) return result;
  return { ok: true, page: mapPage(result.data, false) };
}
