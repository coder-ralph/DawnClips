import { auth } from "@clerk/nextjs/server";
import { isModerator } from "@/lib/deletion-plan";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function GET() {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !isModerator(userId)) return Response.json({ error: "Not found." }, { status: 404 });
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });
  const reports = await admin.from("reports").select("id, target_type, target_id, reason, description, status, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(50);
  if (reports.error) return Response.json({ error: "Could not load reports." }, { status: 500 });
  return Response.json({ reports: reports.data ?? [] });
}

export async function POST(request: Request) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !isModerator(userId)) return Response.json({ error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { id?: string; status?: string } | null;
  if (!body?.id || !["reviewing", "resolved", "dismissed"].includes(body.status ?? "")) {
    return Response.json({ error: "Invalid moderation action." }, { status: 400 });
  }
  const admin = createAdminSupabaseClient();
  if (!admin) return Response.json({ error: "Database is not configured." }, { status: 503 });
  const updated = await admin.from("reports").update({ status: body.status }).eq("id", body.id).select("id");
  if (updated.error || !updated.data?.length) return Response.json({ error: "Report not found." }, { status: 404 });
  return Response.json({ ok: true });
}
