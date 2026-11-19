import "server-only";
import { auth } from "@clerk/nextjs/server";
import { isUuid } from "@/lib/people";
import { callSocial } from "@/lib/social";
import { desiredStateSchema } from "@/lib/validations/social";

/**
 * Shared body of POST /api/profiles/[id]/mute and /restrict. The database function set_profile_control does the real
 * checking (signed in, not yourself, the profile exists, not blocked); this only validates the request shape.
 */
export async function handleProfileControl(request: Request, context: { params: Promise<{ id: string }> }, control: "mute" | "restrict") {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "Profile not found." }, { status: 404 });
  const parsed = desiredStateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: `Invalid ${control}.` }, { status: 400 });

  const result = await callSocial<{ control: string; enabled: boolean }>("set_profile_control", {
    target: id,
    control,
    enabled: parsed.data.desired,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(control === "mute" ? { muted: result.data.enabled } : { restricted: result.data.enabled });
}
