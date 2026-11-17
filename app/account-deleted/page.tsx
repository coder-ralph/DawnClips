import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { receiptCookie, verifyReceipt } from "@/lib/deletion-receipt";

export const metadata: Metadata = {
  title: "Account deleted",
  robots: { index: false, follow: false },
};

async function Confirmation() {
  // Public (no sign-in: the account no longer exists), but only after a deletion has just succeeded in this browser.
  const receipt = (await cookies()).get(receiptCookie)?.value;
  if (!(await verifyReceipt(process.env.CLERK_SECRET_KEY, receipt))) redirect("/");

  return (
    <section className="w-full max-w-[420px] rounded-2xl border bg-background px-6 py-9 text-center shadow-[0_8px_30px_rgb(0_0_0/0.25)] sm:px-8">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-card text-accent-text">
        <CircleCheck aria-hidden="true" className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-xl font-bold leading-7 text-foreground">Your DawnClips account has been successfully deleted.</h1>
      <p className="mt-3 text-sm leading-6 text-muted">Your account and associated data have been removed.</p>
      <Link href="/" className={buttonClasses({ size: "lg", className: "mt-7" })}>
        Back to Home
      </Link>
    </section>
  );
}

export default function AccountDeletedPage() {
  return (
    <main className="auth-backdrop flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <Suspense fallback={<div className="h-[320px] w-full max-w-[420px] rounded-2xl bg-[var(--card)]" />}>
        <Confirmation />
      </Suspense>
    </main>
  );
}
