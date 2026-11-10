"use server";

import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ensureCurrentProfile } from "@/lib/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { flagValue, preferencesSchema } from "@/lib/validations/settings";

export async function updatePreferences(_state: { status: string; message?: string }, formData: FormData) {
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated || !userId) return { status: "error", message: "Sign in to save settings." };
  const parsed = preferencesSchema.safeParse({
    theme: formData.get("theme"),
    language: formData.get("language"),
    showHighlights: formData.get("showHighlights") ?? "off",
    showFollowing: formData.get("showFollowing") ?? "off",
    showFollowers: formData.get("showFollowers") ?? "off",
    showComments: formData.get("showComments") ?? "off",
    showLikes: formData.get("showLikes") ?? "off",
    autoplay: formData.get("autoplay") ?? "off",
    defaultMuted: formData.get("defaultMuted") ?? "off",
    inAppNotifications: formData.get("inAppNotifications") ?? "off",
    notifyLikes: formData.get("notifyLikes") ?? "off",
    notifyComments: formData.get("notifyComments") ?? "off",
    notifyReplies: formData.get("notifyReplies") ?? "off",
    notifyFollows: formData.get("notifyFollows") ?? "off",
  });
  if (!parsed.success) return { status: "error", message: "Check the settings and try again." };

  const profile = await ensureCurrentProfile();
  if (profile.status !== "ready") return { status: "error", message: "Profile not found." };
  const supabase = createServerSupabaseClient();
  if (!supabase) return { status: "error", message: "Supabase is not configured." };

  const input = parsed.data;
  const updated = await supabase.from("profile_settings").update({
    theme: input.theme,
    show_highlights: flagValue(input.showHighlights),
    show_following: flagValue(input.showFollowing),
    show_followers: flagValue(input.showFollowers),
    show_comments: flagValue(input.showComments),
    show_likes: flagValue(input.showLikes),
    autoplay: flagValue(input.autoplay),
    default_muted: flagValue(input.defaultMuted),
    in_app_notifications: flagValue(input.inAppNotifications),
    notify_likes: flagValue(input.notifyLikes),
    notify_comments: flagValue(input.notifyComments),
    notify_replies: flagValue(input.notifyReplies),
    notify_follows: flagValue(input.notifyFollows),
    web_push_enabled: false,
  }).eq("profile_id", profile.profile.id);
  if (updated.error) return { status: "error", message: "Could not save settings." };

  const language = await supabase.from("profiles").update({ language: input.language }).eq("clerk_user_id", userId);
  if (language.error) return { status: "error", message: "Could not save language." };

  const jar = await cookies();
  jar.set("dawnclips-language", input.language, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  jar.set("dawnclips-theme", input.theme, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/settings");
  revalidatePath("/explore");
  return { status: "success" };
}
