import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { NotificationList } from "@/components/notifications/notification-list";
import { PageContainer } from "@/components/ui/page-container";
import { callSocial } from "@/lib/social";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  await auth.protect();
  const result = await callSocial<Parameters<typeof NotificationList>[0]["initial"]>("list_notifications", { page_limit: 30 });
  return (
    <PageContainer>
      {result.ok ? (
        <NotificationList initial={result.data ?? []} />
      ) : (
        <p role="alert" className="px-4 py-8 text-sm text-danger md:px-5">{result.error}</p>
      )}
    </PageContainer>
  );
}
