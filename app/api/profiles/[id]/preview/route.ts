import { auth } from "@clerk/nextjs/server";
import { getPublicProfile } from "@/lib/profile";
import { callSocial } from "@/lib/social";

/**
 * The small profile card shown when hovering a name or avatar. It reuses get_public_profile, so a missing, deleted or
 * blocked profile is a 404 and a hidden follower count stays hidden, and profile_relationship for the follow state.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return Response.json({ error: "Profile not found." }, { status: 404 });

  const result = await getPublicProfile(id);
  if (result.status === "unconfigured") return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  if (result.status === "error") return Response.json({ error: result.message }, { status: 500 });
  if (!result.profile) return Response.json({ error: "Profile not found." }, { status: 404 });
  const profile = result.profile;

  const { isAuthenticated } = await auth();
  let following = false;
  if (isAuthenticated && !profile.isOwn) {
    const relationship = await callSocial<{ following?: boolean }>("profile_relationship", { target: profile.id });
    following = Boolean(relationship.ok && relationship.data?.following);
  }

  // The answer depends on who is asking (follow state, blocks), so it is never shared between people.
  return Response.json(
    {
      id: profile.id,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      followersCount: profile.followersCount,
      isOwn: profile.isOwn,
      following,
      signedIn: isAuthenticated,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
