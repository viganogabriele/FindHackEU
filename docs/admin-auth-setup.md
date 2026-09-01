# Admin auth setup (`/admin`, `/admin/candidates`, and `/admin/hackathons`)

All three development-only admin pages (issue #67, and `/admin` itself added
in issue #81) are gated behind Google sign-in
via Supabase Auth, restricted to a single allowlisted email. This is defense in
depth on top of the existing `NODE_ENV !== "production"` gate, not a
replacement for it - both checks still apply. Because Next.js sets
`NODE_ENV=production` for Vercel Preview builds too, these pages are disabled
in both production and Preview deployments; they are available only when the
app runs with a non-production `NODE_ENV` (normally local development).

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
variable is unset, all three pages and their server actions deny everyone
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
again against `/admin`, `/admin/candidates`, and `/admin/hackathons` before
redirecting.

## 5. Try it locally

```bash
npm run dev
```

Visit `http://localhost:3000/admin` (or either of the two pages it links to)
and click "Sign in with Google". After Google's consent screen, you should
return to the page you started from, signed in - the header shows "Signed in
as {your email} · Sign out" and the corresponding admin view renders. Signing
in with any other Google account should still show the "Admin sign-in
required" gate (the account is authenticated but not authorized).

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
