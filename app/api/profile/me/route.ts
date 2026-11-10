import { ensureCurrentProfile } from "@/lib/profile";

/** The signed-in viewer's own editable profile fields (includes the private Zone ID). */
export async function GET() {
  const sync = await ensureCurrentProfile();
  if (sync.status === "signed_out") return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (sync.status !== "ready") return Response.json({ error: "Profile unavailable." }, { status: 409 });
  const { displayName, username, bio, roleId, zoneId, country, avatarUrl } = sync.profile;
  return Response.json({ profile: { displayName, username, bio, roleId, zoneId, country, avatarUrl } }, { headers: { "Cache-Control": "private, no-store" } });
}
