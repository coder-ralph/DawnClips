import { auth } from "@clerk/nextjs/server";
import { isUuid } from "@/lib/people";
import { callSocial } from "@/lib/social";

/**
 * Removes the profile from the signed-in person's followers. Not a block: they are not told, and they can follow again.
 * The database function only ever deletes a follow of the caller's own account, so this cannot touch anyone else's.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "Profile not found." }, { status: 404 });
  const result = await callSocial<{ removed: boolean; followers_count: number }>("remove_follower", { target: id });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ removed: result.data.removed, followersCount: result.data.followers_count });
}
