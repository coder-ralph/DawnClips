# Legal pages: what was verified and what needs your confirmation

The Privacy Policy (`/privacy`) and Terms of Service (`/terms`) were written from the application's code and database schema, not from a template. This file lists what each claim was checked against and what only you can confirm. Neither page is legal advice. Have a qualified person review them before you rely on them.

There is no separate Cookie Policy page. The app sets only the Clerk sign-in cookies and two preference cookies, and has no analytics or advertising cookies, so cookies are covered in section 3 of the Privacy Policy. Add `/cookies` later if you add analytics, ads or other non-essential cookies.

## Verified against the code

| Statement | Where it was checked |
| --- | --- |
| Sign-in with Google or an email code, no passwords | `README.md` Clerk setup |
| Profile stores Clerk user id, email, email-verified flag, name, picture link | `app/api/webhooks/clerk/route.ts`, `profiles` table |
| Email and Zone ID are not public; Role ID, country, bio, picture, counts are | `get_public_profile()` in `schema-phase6.sql`, `components/profile/edit-profile-modal.tsx` |
| Views recorded per signed-in viewer; signed-out views only increment a counter | `record_clip_view()` |
| Watch time recorded, viewer id optional and cleared if the profile is deleted | `record_clip_watch()`, `clip_watch_events` (`on delete set null`) |
| Creators see totals only (plays, viewers, watch time over 7, 30, 90 days) | `clip_insights()` |
| Rate-limit counters keyed to the account id and action | `consume_rate_limit()` |
| Cookies: `dawnclips-language`, `dawnclips-theme` (one year); local storage keys | `app/(main)/settings/preferences-action.ts`, `components/theme/theme-sync.tsx`, `lib/player-prefs.ts` |
| No analytics or advertising libraries | Search of `app`, `components`, `lib`, `package.json` |
| Provider list: Clerk, Google (via Clerk), Supabase, Cloudflare R2, Vercel | `package.json`, `README.md` |
| Uploads go browser to R2; non-public clips use short-lived signed links | `README.md` R2 section, `lib/r2.ts` |
| MP4 only, 100 MB maximum, up to 5 hero tags, visibility public/unlisted/private | `lib/validations/clip.ts`, `lib/video.ts` |
| Public clips and profiles are in the sitemap (indexable) and embeddable | `app/sitemap.ts`, `components/clip/embed-dialog.tsx`, `app/embed/[id]/page.tsx` |
| Reports need sign-in; reasons are spam, harassment, hate, violence, sexual, copyright, other | `app/api/reports/route.ts`, `lib/validations/clip.ts` |
| Deleting a clip removes R2 objects, then the row and everything attached | `app/api/clips/[id]/route.ts` |
| Account deletion removes videos, clips, likes, comments, saves, follows, blocks, notifications, reports filed, settings, profile and the Clerk user | `lib/deletion.ts` |
| No self-service data export exists | No export route in `app/api` |

## Needs your confirmation before you publish widely

1. **Who runs DawnClips.** The pages say it is run by "coder-ralph" (from `siteConfig.author`). Confirm the operator's legal name, and whether it should be a business name.
2. **Contact address.** Set `NEXT_PUBLIC_CONTACT_EMAIL` in Vercel to show a mailto link. Until then the pages point to the GitHub repository, which is a public place and not ideal for privacy requests.
3. **Minimum age.** Neither page states one. The app does not collect or check a date of birth. Decide on a minimum age and add it to both pages.
4. **Governing law and venue.** Not stated in the Terms. Add the jurisdiction you want (and any local privacy-law wording that applies to you and your users).
5. **Backups and provider logs.** The Privacy Policy says providers may keep backups or logs for a limited time under their own policies. Check Supabase backup retention on your plan and the log settings on Vercel, Clerk and Cloudflare.
6. **Analytics outside the code.** The code has none. Confirm that no analytics or script injection is enabled in the Vercel, Clerk or Cloudflare dashboards.
7. **Disclosures required by law.** Standard language about disclosing information when legally required is not included, because it describes a practice you have not described to me.
8. **Selling or sharing data.** The Privacy Policy does not make a "we do not sell your data" claim. Add it only if it is true for how you operate.
9. **Moderation capacity.** The Terms say reports are reviewed by the people who run DawnClips, who may remove content or accounts. The code lets moderators (ids in `MODERATOR_CLERK_USER_IDS`) review reports and delete clips. There is no automated account suspension.
10. **Copyright complaints.** The Terms point to the copyright report reason or contact. If you want a formal takedown process (for example for the DMCA), it needs a designated contact and wording to be added.
11. **Warranty and liability wording.** Section 8 of the Terms is standard "as is" language and may need adjusting for your jurisdiction.
12. **Moonton and game assets.** The Terms say game names and assets belong to their owners. Confirm you are comfortable with how clips of game footage are described.
13. **Last updated date.** Update `legalUpdated` in `config/site.ts` whenever either page changes.
