import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold text-[var(--text)]">Page not found</h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">That DawnClips page is not available.</p>
      <Link href="/" className="mt-6 text-sm font-semibold text-[var(--accent)]">
        Back home
      </Link>
    </main>
  );
}
