import { auth } from "@clerk/nextjs/server";
import { fetchRelationshipProfiles } from "@/lib/people";
import { isRelationshipListKind } from "@/lib/relationships";

/** GET /api/relationships/blocked|muted|restricted?cursor=... : the next page of one of the signed-in person's lists. */
export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { kind } = await context.params;
  if (!isRelationshipListKind(kind)) return Response.json({ error: "Not found." }, { status: 404 });
  const result = await fetchRelationshipProfiles(kind, new URL(request.url).searchParams.get("cursor"));
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result.page, { headers: { "Cache-Control": "private, no-store" } });
}
