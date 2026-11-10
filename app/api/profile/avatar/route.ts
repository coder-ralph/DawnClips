import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Copies the picture managed in Clerk (upload / remove) onto the DawnClips
 * profile. The URL always comes from Clerk on the server, never from the
 * request body, so it cannot be spoofed.
 */
export async function POST() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createServerSupabaseClient();
  if (!supabase) return Response.json({ error: "Supabase is not configured." }, { status: 503 });

  const avatarUrl = user.hasImage && /^https:\/\//.test(user.imageUrl) ? user.imageUrl.slice(0, 500) : null;
  const updated = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("clerk_user_id", userId)
    .select("username")
    .maybeSingle();
  if (updated.error || !updated.data) return Response.json({ error: "Could not update your picture." }, { status: 500 });
  revalidatePath("/settings");
  revalidatePath(`/profile/${updated.data.username}`);
  return Response.json({ avatarUrl });
}
