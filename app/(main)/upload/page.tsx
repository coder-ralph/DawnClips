import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { Clapperboard } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer, PageHeader } from "@/components/ui/page-container";
import { OpenUploadButton } from "@/components/upload/open-upload-button";
import { UploadLauncher } from "@/components/upload/upload-launcher";

export const metadata: Metadata = {
  title: "New clip",
  robots: { index: false, follow: false },
};

/** Direct link to the uploader: opens the New clip modal over a simple page. */
export default async function UploadPage() {
  await auth.protect();
  return (
    <PageContainer>
      <PageHeader title="New clip" />
      <UploadLauncher />
      <EmptyState
        icon={Clapperboard}
        title="Share an MLBB highlight"
        body="MP4 only, up to 100 MB. Add a caption and tag the heroes you played."
        action={<OpenUploadButton className={buttonClasses()}>Start a new clip</OpenUploadButton>}
      />
    </PageContainer>
  );
}
