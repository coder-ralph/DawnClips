import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ModerationQueue } from "@/components/moderation/queue";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { isModerator } from "@/lib/deletion-plan";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Moderation", robots: { index: false, follow: false } };

export default async function ModerationPage() {
  const { userId } = await auth();
  if (!isModerator(userId)) notFound();
  const admin = createAdminSupabaseClient();
  const reports = await admin?.from("reports").select("id, target_type, target_id, reason, description, status, created_at").eq("status", "open").order("created_at", { ascending: false }).limit(50);
  return (
    <PageContainer>
      <PageHeader title="Moderation" description="Open reports, newest first." />
      <div className="px-4 pb-8 md:px-5">
        <ModerationQueue initial={reports?.data ?? []} />
      </div>
    </PageContainer>
  );
}
