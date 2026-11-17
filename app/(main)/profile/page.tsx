import { auth } from "@clerk/nextjs/server";
import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { ensureCurrentProfile } from "@/lib/profile";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

/**
 * "Your profile" for the signed-in person (where new accounts land after sign-up). The profile row is created here
 * if it does not exist yet, and the redirect to the real profile page only happens once it is ready, so a new
 * account is never sent to a page for a profile that was not created.
 */
async function OwnProfile() {
  await auth.protect();
  const sync = await ensureCurrentProfile();
  if (sync.status === "ready") redirect(`/profile/${sync.profile.username}`);
  if (sync.status === "signed_out") redirect("/");

  return (
    <EmptyState
      icon={Users}
      title={sync.status === "unconfigured" ? "Supabase is not configured" : "Profile unavailable"}
      body={
        sync.status === "error"
          ? sync.message
          : sync.status === "pending_deletion"
            ? "This account is pending deletion."
            : "Add Supabase credentials and apply schema.sql before opening a profile."
      }
      action={sync.status === "error" ? <Link href="/profile" className={buttonClasses({ variant: "secondary", size: "sm" })}>Try again</Link> : undefined}
    />
  );
}

export default function ProfileIndexPage() {
  return (
    <PageContainer>
      <Suspense fallback={<div className="space-y-4 p-4"><div className="skeleton h-24 rounded-xl" /><div className="skeleton h-24 rounded-xl" /></div>}>
        <OwnProfile />
      </Suspense>
    </PageContainer>
  );
}
