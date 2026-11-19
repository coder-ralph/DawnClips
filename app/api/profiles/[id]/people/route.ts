import { fetchProfilePeople, isUuid } from "@/lib/people";
import { isProfilePeopleKind } from "@/lib/relationships";

/** GET /api/profiles/[id]/people?kind=followers|following&cursor=... : the next page of a followers or following list. */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  if (!isUuid(id) || !isProfilePeopleKind(kind)) return Response.json({ error: "Invalid request." }, { status: 400 });
  const result = await fetchProfilePeople(id, kind, url.searchParams.get("cursor"));
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  // The rows carry the signed-in person's own follow state, so they are never shared between people.
  return Response.json(result.page, { headers: { "Cache-Control": "private, no-store" } });
}
