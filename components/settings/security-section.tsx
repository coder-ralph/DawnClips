"use client";

import { useClerk } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

/** Sign-in & security now lives in Settings (it used to be in the More menu). */
export function SecuritySection({ email, verified }: { email: string | null; verified: boolean }) {
  const { openUserProfile } = useClerk();
  return (
    <section id="security" aria-labelledby="security-title" className="scroll-mt-28 border-t px-4 py-6 md:px-5">
      <h2 id="security-title" className="text-base font-bold">Sign-in &amp; security</h2>
      <p className="mt-2 break-all text-[15px]">{email ?? "No email on this account"}</p>
      <p className="mt-1 text-sm text-muted">{verified ? "Email verified" : "Email not verified"}</p>
      <p className="mt-2 text-sm leading-6 text-muted">Change your email, password, connected accounts and active sessions.</p>
      <Button variant="secondary" className="mt-4" onClick={() => openUserProfile()}>Manage sign-in &amp; security</Button>
    </section>
  );
}
