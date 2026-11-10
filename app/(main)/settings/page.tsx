import type { Metadata } from "next";
import { auth, currentUser } from "@clerk/nextjs/server";
import { PublicProfileSection } from "@/components/settings/public-profile-section";
import { SecuritySection } from "@/components/settings/security-section";
import { Suspense } from "react";
import { DeleteAccount } from "@/components/settings/delete-account";
import { PreferencesForm } from "@/components/settings/preferences-form";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { siteConfig } from "@/config/site";
import { normalizeLanguage } from "@/lib/i18n";
import { ensureCurrentProfile } from "@/lib/profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

async function SettingsContent() {
  await auth.protect();
  const [sync, user] = await Promise.all([ensureCurrentProfile(), currentUser()]);

  return (
    <>
      {sync.status === "ready" ? (
        <>
          <PublicProfileSection profile={sync.profile} />
          <SecuritySection
            email={user?.primaryEmailAddress?.emailAddress ?? null}
            verified={user?.primaryEmailAddress?.verification?.status === "verified"}
          />
          <SettingsForms profileId={sync.profile.id} language={normalizeLanguage(sync.profile.language)} />
        </>
      ) : (
        <>
          <SecuritySection
            email={user?.primaryEmailAddress?.emailAddress ?? null}
            verified={user?.primaryEmailAddress?.verification?.status === "verified"}
          />
          <EmptyState
            icon={Users}
            title={sync.status === "unconfigured" ? "Supabase is not configured" : "Profile unavailable"}
            body={
              sync.status === "error"
                ? sync.message
                : sync.status === "pending_deletion"
                  ? "This account is pending deletion."
                  : "Add Supabase credentials and apply schema.sql before editing a profile."
            }
          />
        </>
      )}
      <p className="border-t px-4 py-6 text-xs leading-5 text-muted md:px-5">{siteConfig.disclaimer}</p>
    </>
  );
}

export default function SettingsPage() {
  return (
    <PageContainer>
      <PageHeader title="Settings" />
      <Suspense fallback={<div className="space-y-4 p-4"><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-24 rounded-xl" /></div>}>
        <SettingsContent />
      </Suspense>
    </PageContainer>
  );
}

async function SettingsForms({ profileId, language }: { profileId: string; language: ReturnType<typeof normalizeLanguage> }) {
  const supabase = createServerSupabaseClient();
  const settings = await supabase?.from("profile_settings").select("*").eq("profile_id", profileId).maybeSingle();
  const row = settings?.data;

  return (
    <>
      {row ? (
        <PreferencesForm
          settings={{
            theme: row.theme,
            language,
            showHighlights: row.show_highlights,
            showFollowing: row.show_following,
            showFollowers: row.show_followers,
            showComments: row.show_comments,
            showLikes: row.show_likes,
            autoplay: row.autoplay,
            defaultMuted: row.default_muted,
            inAppNotifications: row.in_app_notifications,
            notifyLikes: row.notify_likes,
            notifyComments: row.notify_comments,
            notifyReplies: row.notify_replies,
            notifyFollows: row.notify_follows,
          }}
        />
      ) : (
        <EmptyState title="Settings unavailable" body="Apply schema.sql so preference rows exist." />
      )}
      <DeleteAccount />
    </>
  );
}
