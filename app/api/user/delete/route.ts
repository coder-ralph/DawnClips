import { auth } from "@clerk/nextjs/server";
import { confirmedDeletion } from "@/lib/deletion-plan";
import { deleteAccount } from "@/lib/deletion";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function DELETE(request: Request) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { confirmation?: unknown } | null;
  if (!confirmedDeletion(body?.confirmation)) {
    return Response.json({ error: "Type DELETE to confirm." }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const allowed = await supabase?.rpc("consume_rate_limit", { action: "delete_account", max_hits: 5, window_seconds: 3600 });
  if (allowed && allowed.data !== true) return Response.json({ error: "Too many deletion attempts." }, { status: 429 });

  const result = await deleteAccount(userId);
  if (!result.ok) return Response.json({ error: result.error, retryable: result.retryable }, { status: result.retryable ? 409 : 500 });
  return Response.json({ ok: true, warning: "warning" in result ? result.warning : null });
}
