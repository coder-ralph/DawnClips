import "server-only";
import { logDbError } from "@/lib/db-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export function socialError(error: { message?: string } | null) {
  const message = error?.message ?? "";
  if (message.includes("self follow")) return { status: 409, error: "You cannot follow yourself." };
  if (message.includes("invalid comment")) return { status: 400, error: "Comment must be 1–500 characters." };
  if (message.includes("edit window")) return { status: 403, error: "The 15-minute edit window has closed." };
  if (message.includes("invalid clip")) return { status: 400, error: "Check the clip details and try again." };
  if (message.includes("unauthorized")) return { status: 401, error: "Unauthorized" };
  if (message.includes("not allowed")) return { status: 403, error: "You cannot do that." };
  return { status: 500, error: "Could not update that." };
}

export async function callSocial<T>(name: string, args: Record<string, unknown>) {
  const supabase = createServerSupabaseClient();
  if (!supabase) return { ok: false as const, status: 503, error: "Supabase is not configured." };
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    // Name, code and message only (no arguments), so a failing RPC can be diagnosed from the server log.
    logDbError(`Social action failed: ${name}`, error);
    const mapped = socialError(error);
    return { ok: false as const, ...mapped };
  }
  return { ok: true as const, data: data as T };
}

export async function unreadCount() {
  const supabase = createServerSupabaseClient();
  if (!supabase) return 0;
  const { data, error } = await supabase.rpc("unread_notification_count");
  if (error || typeof data !== "number") return 0;
  return data;
}
