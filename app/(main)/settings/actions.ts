"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { profileUpdateSchema } from "@/lib/validations/profile";
import { normalizeUsername } from "@/lib/username";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/utils";

export type ProfileActionState =
  | { status: "idle" }
  | { status: "success"; username: string }
  | { status: "error"; message: string };

export async function updateProfile(_state: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return { status: "error", message: "Sign in to edit your profile." };

  const parsed = profileUpdateSchema.safeParse({
    displayName: formData.get("displayName"),
    username: formData.get("username"),
    bio: formData.get("bio"),
    roleId: formData.get("roleId"),
    zoneId: formData.get("zoneId"),
    country: formData.get("country"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) return { status: "error", message: "Supabase is not configured." };

  const allowed = await supabase.rpc("consume_rate_limit", {
    action: "profile_update",
    max_hits: 10,
    window_seconds: 600,
  });
  if (allowed.error || allowed.data !== true) {
    return { status: "error", message: "Too many profile updates. Wait a few minutes and try again." };
  }

  const input = parsed.data;
  const updated = await supabase
    .from("profiles")
    .update({
      display_name: input.displayName,
      username: normalizeUsername(input.username),
      bio: input.bio,
      role_id: input.roleId || null,
      zone_id: input.zoneId || null,
      country: input.country,
    })
    .eq("clerk_user_id", userId)
    .select("username")
    .maybeSingle();

  if (updated.error) {
    console.error("Profile update failed");
    if (updated.error.code === "23505") return { status: "error", message: "That username is already taken." };
    if (updated.error.message.toLowerCase().includes("reserved")) {
      return { status: "error", message: "That username is reserved." };
    }
    return { status: "error", message: safeErrorMessage(updated.error, "Could not save your profile.") };
  }
  if (!updated.data) return { status: "error", message: "Profile was not found." };

  revalidatePath("/settings");
  revalidatePath(`/profile/${updated.data.username}`);
  return { status: "success", username: updated.data.username };
}
