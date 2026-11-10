import "server-only";
import { cache } from "react";
import { normalizeLanguage } from "@/lib/i18n";
import { ensureCurrentProfile } from "@/lib/profile";
import { unreadCount } from "@/lib/social";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ShellViewer = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export type ShellData = {
  status: "signed_out" | "unconfigured" | "pending_deletion" | "error" | "ready";
  message?: string;
  viewer: ShellViewer | null;
  profileHref: string | null;
  unread: number;
  prefs: {
    theme: "light" | "dark" | "system";
    language: ReturnType<typeof normalizeLanguage>;
    autoplay: boolean;
    muted: boolean;
  } | null;
};

async function loadPrefs(profileId: string, language: string) {
  const supabase = createServerSupabaseClient();
  const settings = await supabase
    ?.from("profile_settings")
    .select("theme, autoplay, default_muted")
    .eq("profile_id", profileId)
    .maybeSingle();
  const theme = settings?.data?.theme;
  return {
    theme: theme === "light" || theme === "system" ? theme : ("dark" as const),
    language: normalizeLanguage(language),
    autoplay: settings?.data?.autoplay ?? true,
    muted: settings?.data?.default_muted ?? true,
  };
}

/**
 * Everything the app chrome needs about the current viewer. Wrapped in
 * React.cache so the sidebar, mobile nav, account menu and page islands share
 * one lookup per request instead of each repeating it.
 */
export const getShellData = cache(async (): Promise<ShellData> => {
  const sync = await ensureCurrentProfile();
  if (sync.status === "signed_out" || sync.status === "unconfigured") {
    return { status: sync.status, viewer: null, profileHref: null, unread: 0, prefs: null };
  }
  if (sync.status === "error") {
    return { status: "error", message: sync.message, viewer: null, profileHref: null, unread: 0, prefs: null };
  }
  if (sync.status === "pending_deletion") {
    return { status: "pending_deletion", viewer: null, profileHref: null, unread: 0, prefs: null };
  }
  const [unread, prefs] = await Promise.all([
    unreadCount(),
    loadPrefs(sync.profile.id, sync.profile.language),
  ]);
  return {
    status: "ready",
    viewer: {
      id: sync.profile.id,
      username: sync.profile.username,
      displayName: sync.profile.displayName,
      avatarUrl: sync.profile.avatarUrl,
    },
    profileHref: `/profile/${sync.profile.username}`,
    unread,
    prefs,
  };
});
