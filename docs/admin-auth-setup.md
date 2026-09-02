# Admin auth setup (`/admin` and `/admin/candidates`)

Both development-only admin pages (issue #67, and `/admin` itself added
in issue #81) are gated behind Google sign-in
via Supabase Auth, restricted to a single allowlisted email. This is defense in
depth on top of the existing `NODE_ENV !== "production"` gate, not a
replacement for it - both checks still apply. Because Next.js sets
`NODE_ENV=production` for Vercel Preview builds too, these pages are disabled
in both production and Preview deployments; they are available only when the
app runs with a non-production `NODE_ENV` (normally local development).

**If you just want to poke at the admin dashboard locally, skip straight to
["Skip auth entirely for local development"](#skip-auth-entirely-for-local-development)
below - you do not need a Google Cloud OAuth client for that.** The rest of
this doc (sections 1-5) is only for the maintainer setting up real Google
sign-in, e.g. for a hosted deployment.

`/admin/hackathons` used to be a third gated page (published-hackathon
management); issue #82 merged that into `/admin/candidates`'s Approved tab
and retired the standalone route - it now just redirects to
`/admin/candidates?status=approved` and needs no auth session of its own.

Nobody but the maintainer has real Google Cloud OAuth credentials, so this
setup is a manual, one-time step you (the maintainer) need to do locally.
Everything that doesn't require real credentials has already been
implemented and verified (see the PR description) - this doc only covers
what's left.

## 1. Create a Google Cloud OAuth 2.0 Client ID

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and
   create (or reuse) a project.
2. Go to **APIs & Services → Credentials → Create Credentials → OAuth
   client ID**.
3. Application type: **Web application**.
4. Under **Authorized redirect URIs**, add your local Supabase Auth
   callback URL. For the default local Supabase ports used by this repo's
   `supabase/config.toml`, that's:

   ```
   http://127.0.0.1:54321/auth/v1/callback
   ```

   (Run `npx supabase status` and use the printed `API_URL` + `/auth/v1/callback`
   if your ports differ.) If you later deploy Supabase Auth to a hosted
   project, add that project's own `.../auth/v1/callback` URL too.

5. Save, then copy the generated **Client ID** and **Client secret**.

## 2. Set environment variables

Add to your (gitignored) `.env.local`:

```bash
GOOGLE_CLIENT_ID=<the client ID from step 1>
GOOGLE_CLIENT_SECRET=<the client secret from step 1>
ADMIN_ALLOWED_EMAIL=<your own Google account email>
```

`ADMIN_ALLOWED_EMAIL` is the only account allowed into any admin page -
this is a single-maintainer project, not a multi-user allowlist. If this
variable is unset, both pages and their server actions deny everyone
(fail closed), not allow everyone.

## 3. Restart local Supabase

`supabase/config.toml` contains the local `[auth.external.google]` section
wired to read `env(GOOGLE_CLIENT_ID)` / `env(GOOGLE_CLIENT_SECRET)`, with nonce
verification enabled. This file is read by the local Supabase CLI only; it
does not configure a hosted Supabase project. Local config changes only take
effect on restart:

```bash
npx supabase stop
npx supabase start
```

**Important footgun, found live (2026-09-01):** the Supabase CLI reads
`env(...)` references from its own process environment - the shell that
actually runs `supabase start` - not from `.env.local`. `.env.local` is a
Next.js/dotenv convention that only the Next.js dev server itself loads
automatically; the Supabase CLI has no idea it exists. If you just edited
`.env.local` and run `npx supabase start` from a shell that never sourced
that file, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` will silently
resolve to empty strings - Supabase Auth's settings endpoint will still
report `"google": true` (the provider block exists), but real sign-in
attempts will fail. Either export the variables into the same shell
before starting Supabase:

```bash
set -a; source .env.local; set +a
npx supabase stop
npx supabase start
```

or use a terminal/tool that already sources `.env.local` into its
environment before invoking the Supabase CLI.

## 4. Hosted Supabase and deployment URLs

For a hosted deployment, configure Google in the Supabase Dashboard (or
Management API) and add the hosted project's Auth callback URL to the Google
Cloud OAuth client's **Authorized redirect URIs**:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

In Supabase **Authentication → URL Configuration**, set the production Site
URL and add the deployed application's exact callback URL as an allowed
redirect URL:

```
https://<your-app.example.com>/auth/callback
```

The local `supabase/config.toml` allowlist does not carry over to hosted
Supabase. Configure each real deployment domain separately, and do not add a
catch-all production wildcard. The application callback validates `next`
again against `/admin` and `/admin/candidates` before redirecting.

## 5. Try it locally

```bash
npm run dev
```

Visit `http://localhost:3000/admin` (or `/admin/candidates`, which it links
to) and click "Sign in with Google". After Google's consent screen, you
should return to the page you started from, signed in - the header shows
"Signed in as {your email} · Sign out" and the corresponding admin view
renders. Signing in with any other Google account should still show the
"Admin sign-in required" gate (the account is authenticated but not
authorized).

## What was NOT verified by the agent that built this

Full sign-in end-to-end was **not** tested in the environment that
implemented issue #67 - there were no real Google OAuth credentials
available there. What _was_ verified live in that environment:

- All three admin pages render the sign-in gate (not protected data) with no
  session.
- All five server actions reject (`"Not authorized"`) when called with no
  valid session.
- The app builds, type-checks, and lints cleanly with the auth code in
  place.

Only a real successful Google sign-in after completing the setup above can confirm the
OAuth redirect flow, the Supabase Auth callback, and the
`ADMIN_ALLOWED_EMAIL` match actually work end-to-end - do that once after
following this doc.

## Skip auth entirely for local development

Issue #4: setting up a real Google Cloud OAuth client (sections 1-5 above)
is unnecessary friction if all you want is to clone the repo and try out
the admin dashboard. `lib/services/require-admin-auth.ts` has a **local-only
auth bypass** that treats every request as authorized, with no Google
sign-in at all, whenever `NODE_ENV !== "production"` (hardcoded, checked
inline by both `getAdminAuthStatus()` and `requireAdminAuth()` - never just
inferred from an outer gate) **and** either:

- `GOOGLE_CLIENT_ID`/`ADMIN_ALLOWED_EMAIL` are both left unset (the default
  for a fresh clone - real sign-in couldn't work without them anyway), or
- you explicitly set `ADMIN_LOCAL_NO_AUTH=true` (useful if you *do* have
  `ADMIN_ALLOWED_EMAIL` configured, e.g. because you're also testing real
  sign-in, but want to temporarily skip it).

This bypass is categorically unreachable when `NODE_ENV=production`
(including Vercel Preview builds) - see the doc comment on
`isLocalNoAuthBypassEnabled()` in `lib/services/require-admin-auth.ts` for
the exact reasoning, and CLAUDE.md's "Local no-auth admin bypass" entry for
how this was verified live.

### From a fresh clone to a working local admin instance, with seed data, no OAuth setup

```bash
npx supabase start        # boots local Postgres/Studio via Docker; applies
                           # supabase/migrations/* AND supabase/seed.sql on
                           # first run (small set of sample hackathons and
                           # candidates - see CLAUDE.md's "Local Supabase")
cp .env.example .env.local  # fill in NEXT_PUBLIC_SUPABASE_URL etc. from the
                             # `supabase start` output; leave GOOGLE_CLIENT_ID,
                             # ADMIN_ALLOWED_EMAIL, and ADMIN_LOCAL_NO_AUTH
                             # all blank
npm install
npm run dev
```

Then open `http://localhost:3000/admin/candidates` - it renders directly,
no sign-in gate, populated with the seed data. If Supabase was already
running from a previous session and you want a clean re-seed:

```bash
npx supabase db reset      # drops and recreates the local DB, re-applying
                            # every migration and supabase/seed.sql
```
