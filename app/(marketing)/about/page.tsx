import {
  ArrowRight,
  BarChart3,
  Bookmark,
  ChevronDown,
  Code2,
  Compass,
  Flag,
  Globe,
  Heart,
  MessageCircle,
  ShieldCheck,
  Share2,
  Tags,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { HeroVisual } from "@/components/marketing/hero-visual";
import { buttonClasses } from "@/components/ui/button";
import { siteConfig } from "@/config/site";

const title = "DawnClips: share and discover Mobile Legends highlights";
const description =
  "Upload your best Mobile Legends: Bang Bang plays, mark the moments that matter, and share them with a community of players. Sign in with Google or an email code.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    siteName: siteConfig.name,
    title,
    description,
    url: "/about",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: `${siteConfig.name}: ${siteConfig.tagline}` }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
};

const features = [
  {
    icon: Upload,
    title: "Share your highlights",
    body: "Upload an MP4 up to 100 MB straight from your browser, add a cover image, and choose who can see it: public, unlisted or private.",
  },
  {
    icon: Tags,
    title: "Mark the moments",
    body: "Tag a clip with timestamps like Savage, Lord Steal or Clutch. Viewers tap a moment to jump straight to the action.",
  },
  {
    icon: Compass,
    title: "Discover by hero",
    body: "Browse For you, Following, Trending and Latest. Search by hero, role or lane to find clips and players.",
  },
  {
    icon: Heart,
    title: "A real community",
    body: "Like, comment, reply, save clips for later and follow the players you enjoy watching.",
  },
  {
    icon: BarChart3,
    title: "Know how clips perform",
    body: "Creators can see plays, viewers and watch time for each clip over the last 7, 30 or 90 days.",
  },
  {
    icon: ShieldCheck,
    title: "You stay in control",
    body: "Pick comment settings, hide parts of your profile, block or report accounts, and delete a clip or your whole account from Settings.",
  },
];

const extras = [
  { icon: MessageCircle, label: "Threaded comments" },
  { icon: Bookmark, label: "Saved clips" },
  { icon: Users, label: "Public profiles" },
  { icon: Code2, label: "Embeddable player" },
  { icon: Globe, label: "English, Tagalog, Bahasa Indonesia" },
  { icon: Flag, label: "Report tools" },
];

const steps = [
  {
    icon: UserPlus,
    title: "Create your account",
    body: "Sign in with Google or an email code. There are no passwords to remember.",
  },
  {
    icon: Upload,
    title: "Upload a clip",
    body: "Add a title, tag the heroes involved, mark your key moments and pick a visibility.",
  },
  {
    icon: Share2,
    title: "Share it with players",
    body: "Send your profile or clip link, or embed a public clip elsewhere. Preview cards show your name and avatar.",
  },
];

const faqs = [
  {
    q: "Is DawnClips official?",
    a: siteConfig.disclaimer,
  },
  {
    q: "What can I upload?",
    a: "MP4 videos up to 100 MB. You can add a title, a description, up to five hero tags, timestamped moments and an optional cover image.",
  },
  {
    q: "Who can see my clips?",
    a: "You choose per clip. Public clips can appear in feeds and search. Unlisted clips are only reachable by link. Private clips are visible only to you.",
  },
  {
    q: "How do I sign in?",
    a: "With your Google account or a one-time code sent to your email. DawnClips does not use passwords.",
  },
  {
    q: "Can I delete my clips or my account?",
    a: "Yes. You can delete any clip you posted, and Settings includes account deletion, which removes your clips and videos, your profile data and your sign-in account.",
  },
  {
    q: "Can I embed a clip on another site?",
    a: "Public clips include an embed option so you can place the player on your own page.",
  },
];

const builtWith = ["Next.js", "Clerk", "Supabase", "Cloudflare R2", "Vercel"];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="marketing-glow relative overflow-hidden border-b">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="fade-up inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              For Mobile Legends: Bang Bang players
            </p>
            <h1 className="fade-up mt-5 text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl" style={{ "--delay": "80ms" } as React.CSSProperties}>
              Your MLBB moments.
              <br />
              <span className="brand-gradient-text">Your community.</span>
            </h1>
            <p className="fade-up mt-5 max-w-xl text-lg leading-8 text-muted" style={{ "--delay": "160ms" } as React.CSSProperties}>
              Upload your best plays, tag the heroes, mark the moments that matter, and share them with players who know exactly why that rotation was clean.
            </p>
            <div className="fade-up mt-8 flex flex-wrap items-center gap-3" style={{ "--delay": "240ms" } as React.CSSProperties}>
              <Link href="/" className={buttonClasses({ size: "lg", className: "group" })}>
                Start watching
                <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link href="/sign-up" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                Create an account
              </Link>
            </div>
            <p className="fade-up mt-4 text-sm text-muted" style={{ "--delay": "320ms" } as React.CSSProperties}>
              Sign in with Google or an email code. No passwords.
            </p>
          </div>
          <div className="fade-up" style={{ "--delay": "200ms" } as React.CSSProperties}>
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-16 border-b">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="reveal max-w-2xl">
            <p className="text-sm font-semibold text-accent-text">Features</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Everything a highlight needs</h2>
            <p className="mt-3 text-lg leading-8 text-muted">
              Built around short gameplay clips: easy to post, easy to jump around in, and easy to find.
            </p>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <li key={feature.title} className="reveal feature-card rounded-2xl border bg-card p-6">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                  <feature.icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{feature.title}</h3>
                <p className="mt-2 leading-7 text-muted">{feature.body}</p>
              </li>
            ))}
          </ul>
          <ul className="reveal mt-8 flex flex-wrap gap-2" aria-label="Also included">
            {extras.map((extra) => (
              <li key={extra.label} className="inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm text-muted">
                <extra.icon aria-hidden="true" className="h-4 w-4" />
                {extra.label}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-16 border-b bg-[var(--background-secondary)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="reveal max-w-2xl">
            <p className="text-sm font-semibold text-accent-text">How it works</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">From match to feed in three steps</h2>
          </div>
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="reveal relative rounded-2xl border bg-background p-6">
                <span className="absolute right-5 top-4 text-5xl font-bold tabular-nums text-[var(--border)]" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent-text">
                  <step.icon aria-hidden="true" className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-semibold">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-2 leading-7 text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 border-b">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="reveal">
            <p className="text-sm font-semibold text-accent-text">FAQ</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Questions, answered</h2>
            <p className="mt-3 text-lg leading-8 text-muted">
              More detail is in the <Link href="/privacy" className="text-accent-text underline underline-offset-4">Privacy Policy</Link> and the{" "}
              <Link href="/terms" className="text-accent-text underline underline-offset-4">Terms of Service</Link>.
            </p>
          </div>
          <div className="divide-y rounded-2xl border bg-card">
            {faqs.map((faq) => (
              <details key={faq.q} className="faq-item group px-5">
                <summary className="flex items-center justify-between gap-4 py-4 text-left font-semibold">
                  {faq.q}
                  <ChevronDown aria-hidden="true" className="faq-chevron h-5 w-5 shrink-0 text-muted transition-transform" />
                </summary>
                <p className="pb-5 leading-7 text-muted">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Built with + final call to action */}
      <section className="marketing-glow">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 text-center sm:px-6 md:py-24">
          <div className="reveal mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Ready to share your <span className="brand-gradient-text">next highlight</span>?
            </h2>
            <p className="mt-3 text-lg leading-8 text-muted">Join the community, upload a clip and see what other players are posting.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/sign-up" className={buttonClasses({ size: "lg" })}>Create an account</Link>
              <Link href="/explore" className={buttonClasses({ variant: "secondary", size: "lg" })}>Explore clips</Link>
            </div>
          </div>
          <div className="reveal mt-14">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Built with</p>
            <ul className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted">
              {builtWith.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
