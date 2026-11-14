import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AccountMenu } from "@/components/layout/account-menu";
import { MobileNavFallback } from "@/components/layout/nav-fallbacks";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SidebarNavFallback } from "@/components/layout/nav-fallbacks";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeSync } from "@/components/theme/theme-sync";
import { OpenUploadButton } from "@/components/upload/open-upload-button";
import { UploadModal } from "@/components/upload/upload-modal";
import { r2Configured } from "@/lib/r2";
import { buttonClasses } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { ToastProvider } from "@/components/ui/toast";
import { siteConfig } from "@/config/site";
import { getShellData } from "@/lib/shell-data";

/*
 * The frame (sidebar, header, bottom bar) renders immediately. Only the parts
 * that depend on who is signed in live inside their own Suspense island, so a
 * slow profile lookup no longer blanks the whole app.
 */

async function SidebarIsland() {
  const data = await getShellData();
  const signedIn = data.status !== "signed_out";
  return (
    <>
      <SidebarNav signedIn={signedIn} profileHref={data.profileHref} unread={data.unread} />
      {signedIn ? (
        <OpenUploadButton className={buttonClasses({ size: "icon", className: "mt-4 xl:h-11 xl:w-full xl:px-5" })}>
          <Plus aria-hidden="true" strokeWidth={2.8} className="h-5 w-5" />
          <span className="hidden xl:inline">New clip</span>
        </OpenUploadButton>
      ) : null}
    </>
  );
}

async function MobileNavIsland() {
  const data = await getShellData();
  return <MobileNav signedIn={data.status !== "signed_out"} profileHref={data.profileHref} unread={data.unread} />;
}

async function UploadHost() {
  const data = await getShellData();
  if (data.status !== "ready" || !data.viewer) return null;
  return (
    <UploadModal
      configured={r2Configured()}
      viewer={{ name: data.viewer.displayName, username: data.viewer.username, avatarUrl: data.viewer.avatarUrl }}
    />
  );
}

async function ShellNotices() {
  const data = await getShellData();
  return (
    <>
      {data.prefs ? (
        <ThemeSync theme={data.prefs.theme} language={data.prefs.language} autoplay={data.prefs.autoplay} muted={data.prefs.muted} />
      ) : null}
      {data.status === "unconfigured" ? (
        <p className="border-b px-4 py-2 text-sm text-muted">Supabase is not configured, so profiles cannot be saved yet.</p>
      ) : null}
      {data.status === "pending_deletion" ? (
        <p className="border-b px-4 py-2 text-sm text-danger" role="alert">This account is pending deletion. Retry from settings.</p>
      ) : null}
      {data.status === "error" ? (
        <p className="border-b px-4 py-2 text-sm text-danger" role="alert">{data.message}</p>
      ) : null}
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-dvh w-full max-w-[1280px]">
        <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center px-2 pb-4 pt-3 md:flex xl:w-[256px] xl:items-stretch xl:px-3">
          <Link href="/" aria-label="DawnClips home" className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-hover xl:w-auto xl:justify-start xl:px-2">
            <span className="xl:hidden"><Logo markOnly /></span>
            <span className="hidden xl:block"><Logo /></span>
          </Link>
          <Suspense fallback={<SidebarNavFallback />}>
            <SidebarIsland />
          </Suspense>
          <div className="mt-auto flex w-full flex-col items-center gap-3 xl:items-stretch">
            <AccountMenu variant="sidebar" />
            <p className="hidden px-3 text-[11px] leading-4 text-muted xl:block">{siteConfig.disclaimer}</p>
            <p className="hidden items-center gap-3 px-3 text-[11px] text-muted xl:flex">
              <Link href="/about" className="hover:text-foreground">About</Link>
              <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link href="/terms" className="hover:text-foreground">Terms</Link>
            </p>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b bg-background/90 px-4 backdrop-blur md:hidden">
            <Link href="/" aria-label="DawnClips home">
              <Logo />
            </Link>
            <AccountMenu variant="header" />
          </header>
          <Suspense fallback={null}>
            <ShellNotices />
            <UploadHost />
          </Suspense>
          <main id="main" className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
            {children}
          </main>
        </div>

        <Suspense fallback={<MobileNavFallback />}>
          <MobileNavIsland />
        </Suspense>
      </div>
    </ToastProvider>
  );
}
