import { SignIn, SignUp } from "@clerk/nextjs";
import { Suspense } from "react";
import { Logo } from "@/components/ui/logo";
import { siteConfig } from "@/config/site";

export function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <main className="auth-backdrop flex min-h-full flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <Suspense fallback={<div className="h-[520px] w-full max-w-[400px] rounded-2xl bg-[var(--card)]" />}>
        {mode === "sign-in" ? (
          <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/" />
        ) : (
          <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/" />
        )}
      </Suspense>
      <p className="mt-6 max-w-md text-center text-xs leading-5 text-[var(--text-secondary)]">
        {siteConfig.disclaimer}
      </p>
    </main>
  );
}
