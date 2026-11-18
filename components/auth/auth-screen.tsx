import { SignIn, SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/ui/logo";
import { siteConfig } from "@/config/site";
import { clerkAppearance } from "@/lib/clerk-appearance";

// Sign-in and sign-up are separate routes, so the Clerk card is torn down and mounted again when switching. Until the new
// card is there its place would be empty and everything under it would jump up and back down. This much room is kept for
// the card in both modes (and shown as a placeholder meanwhile), so the logo, the card and the links stay where they are.
// A taller card (an error, a verification step) still grows past it.
const CARD_MIN_HEIGHT = 520;

// Painted in the card's own colour, so swapping the placeholder for the card reads as the card staying put.
function CardPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="w-full max-w-[400px] rounded-2xl"
      style={{ height: CARD_MIN_HEIGHT, backgroundColor: clerkAppearance.variables.colorBackground }}
    />
  );
}

export function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <main className="auth-backdrop flex min-h-full flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <div className="flex w-full flex-col items-center" style={{ minHeight: CARD_MIN_HEIGHT }}>
        <Suspense fallback={<CardPlaceholder />}>
          {mode === "sign-in" ? (
            <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" fallbackRedirectUrl="/" signUpFallbackRedirectUrl="/profile" fallback={<CardPlaceholder />} />
          ) : (
            <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" fallbackRedirectUrl="/profile" fallback={<CardPlaceholder />} />
          )}
        </Suspense>
      </div>
      <p className="mt-6 max-w-md text-center text-xs leading-5 text-[var(--text-secondary)]">
        {siteConfig.disclaimer}
      </p>
      <p className="mt-3 flex items-center gap-3 text-xs text-[var(--text-secondary)]">
        <Link href="/terms" className="underline underline-offset-2 hover:text-[var(--text)]">Terms</Link>
        <Link href="/privacy" className="underline underline-offset-2 hover:text-[var(--text)]">Privacy</Link>
        <Link href="/about" className="underline underline-offset-2 hover:text-[var(--text)]">About</Link>
      </p>
    </main>
  );
}
