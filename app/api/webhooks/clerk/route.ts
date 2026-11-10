import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";
import { generateUsername } from "@/lib/username";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  let event;
  try {
    event = await verifyWebhook(req);
  } catch (error) {
    console.error("Clerk webhook verification failed", error instanceof Error ? error.name : "unknown");
    return new Response("Verification failed", { status: 400 });
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) return new Response("Database is not configured", { status: 500 });

  if (event.type === "user.created" || event.type === "user.updated") {
    const email = event.data.email_addresses.find((item) => item.id === event.data.primary_email_address_id);
    const displayName = [event.data.first_name, event.data.last_name].filter(Boolean).join(" ") || "Player";
    const existing = await supabase
      .from("profiles")
      .select("id, avatar_source")
      .eq("clerk_user_id", event.data.id)
      .maybeSingle();

    if (existing.error) return new Response("Lookup failed", { status: 500 });

    if (!existing.data) {
      let created = false;
      for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
        const inserted = await supabase.from("profiles").insert({
          clerk_user_id: event.data.id,
          email: email?.email_address ?? null,
          email_verified: email?.verification?.status === "verified",
          display_name: displayName.slice(0, 40),
          username: generateUsername(displayName),
          avatar_url: event.data.image_url,
          avatar_source: "clerk",
        });
        if (!inserted.error) {
          created = true;
          break;
        }
        if (inserted.error.code !== "23505") return new Response("Insert failed", { status: 500 });
        const again = await supabase
          .from("profiles")
          .select("id")
          .eq("clerk_user_id", event.data.id)
          .maybeSingle();
        if (again.data) created = true;
      }
      if (!created) return new Response("Insert failed", { status: 500 });
    }

    if (existing.data) {
      const patch: {
        email: string | null;
        email_verified: boolean;
        avatar_url?: string;
        avatar_source?: "clerk";
      } = {
        email: email?.email_address ?? null,
        email_verified: email?.verification?.status === "verified",
      };
      if (existing.data.avatar_source === "clerk") {
        patch.avatar_url = event.data.image_url;
        patch.avatar_source = "clerk";
      }
      const updated = await supabase.from("profiles").update(patch).eq("id", existing.data.id);
      if (updated.error) return new Response("Update failed", { status: 500 });
    }
  }

  if (event.type === "user.deleted" && event.data.id) {
    const marked = await supabase
      .from("profiles")
      .update({ deletion_status: "pending_deletion", deleted_at: new Date().toISOString() })
      .eq("clerk_user_id", event.data.id);
    if (marked.error) return new Response("Delete mark failed", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
