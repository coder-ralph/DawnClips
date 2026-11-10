import { auth } from "@clerk/nextjs/server";
import { getOwnProfile } from "@/lib/profile";

export async function GET() {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getOwnProfile();
  if (result.status === "unconfigured") {
    return Response.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  if (result.status === "error") {
    return Response.json({ error: result.message }, { status: 500 });
  }
  if (result.status !== "ready" && result.status !== "pending_deletion") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({ profile: result.profile });
}
