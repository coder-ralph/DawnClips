# DawnClips

Community platform for Mobile Legends: Bang Bang gameplay highlights.

DawnClips is an unofficial community project and is not endorsed by or affiliated with Moonton or Mobile Legends: Bang Bang.

DawnClips includes authentication, uploads, the feed, social actions, explore, settings, moderation, and account deletion.

## Stack

- Next.js 16 App Router, TypeScript, Tailwind CSS 4
- Clerk for Google OAuth and passwordless email
- Supabase PostgreSQL with Row Level Security
- Cloudflare R2 in a later phase

## Prerequisites

- Node.js 20.9 or newer
- A Clerk application
- A Supabase project
- The Clerk Supabase integration activated (required before profiles can be saved)

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. Do not commit it.

### Clerk

Development keys can be created with:

```bash
npx clerk init
```

Then, in the Clerk Dashboard:

1. Set the application name to DawnClips.
2. Enable Google as a social connection.
3. Enable email verification code (passwordless). Do not enable passwords.
4. Activate the [Supabase integration](https://dashboard.clerk.com/setup/supabase) and copy the Clerk domain.
5. Add `http://localhost:3000` to the allowed redirect origins.

### Supabase

1. Create a project.
2. Open Authentication → Sign In / Providers → Add provider → Clerk, and paste the Clerk domain.
3. Copy the project URL and the publishable/anon key into `.env.local`.
4. Copy the service-role key into `SUPABASE_SERVICE_ROLE_KEY`. Never expose it to the browser.
5. Run `schema.sql` in the SQL editor. If an older schema is already applied, run `schema-phase2.sql` through `schema-phase5.sql` in order.

The SQL editor runs as the table owner and bypasses RLS. It does not prove the policies. Test as the Authenticated role.

### Cloudflare R2

1. Create a bucket and an API token with object read and write.
2. Put the account id, keys, and bucket name in `.env.local`.
3. Add a CORS rule that allows `PUT` and `GET` from your site origin, with `AllowedHeaders` including `Content-Type`. A wildcard origin works for a local test and should not be the production setting.
4. Keep the bucket private. `R2_PUBLIC_URL` is optional and is used only for published public clips. Private and unlisted playback uses a short-lived signed URL and is never stored.

Uploads go from the browser straight to R2. The app verifies the object size, content type, and MP4 `ftyp` signature before publishing.

### Webhooks

Create a Clerk webhook endpoint at `/api/webhooks/clerk` for `user.created`, `user.updated`, and `user.deleted`. Put the signing secret in `CLERK_WEBHOOK_SIGNING_SECRET`.

Webhook delivery is eventually consistent. The app also creates a profile on the first authenticated request, so sign-in does not wait for the webhook. `user.deleted` only marks the profile pending deletion. It does not remove clips or R2 objects; that cleanup is a later phase, and deleting the profile first would lose the object keys.

### Local development

```bash
npm run dev
```

Open http://localhost:3000.

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Architecture notes that later phases must keep

- Clerk `sub` is the only trusted identity. Do not accept a user id from the client.
- Policies use `auth.jwt()->>'sub'`. `auth.uid()` is null for Clerk third-party tokens.
- Public profile reads go through `get_public_profile()`. A table select returns only the signed-in user's row, because row policies cannot hide email and game ids.
- Unlisted clips are not readable through a table select. Playback uses `authorize_clip_playback`, which only the service role can call.
- Engagement counters cannot be updated by a normal client update.
- The service-role client must not also forward the user's access token.

## Not in this phase

Web push is not implemented. The web push setting stays off. Account deletion removes R2 objects before database rows and does not report success if cleanup fails.
