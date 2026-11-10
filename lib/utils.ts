export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function formatJoinDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function safeErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = String(error.message);
    if (/jwt|jws|invalid api key|permission denied|row-level security|42501/i.test(message)) {
      return "DawnClips could not use your session with Supabase. Confirm Clerk is activated as a Supabase third-party provider.";
    }
  }
  return fallback;
}
