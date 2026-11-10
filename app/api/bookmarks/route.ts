import { auth } from "@clerk/nextjs/server";
import { callSocial } from "@/lib/social";

export async function GET() {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const result = await callSocial<unknown[]>("list_saved_clips", { page_limit: 30 });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ clips: result.data ?? [] });
}
