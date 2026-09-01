# Admin auth setup (`/admin/candidates`)

`/admin/candidates` (issue #67) is gated behind Google sign-in via Supabase
Auth, restricted to a single allowlisted email. This is defense in depth on
top of the existing `NODE_ENV !== "production"` gate, not a replacement for
it - both checks still apply.

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

`ADMIN_ALLOWED_EMAIL` is the only account allowed into `/admin/candidates` -
this is a single-maintainer project, not a multi-user allowlist. If this
variable is unset, the page and its server actions deny everyone (fail
closed), not allow everyone.

## 3. Restart local Supabase

`supabase/config.toml` already has a `[auth.external.google]` section
wired to read `env(GOOGLE_CLIENT_ID)` / `env(GOOGLE_CLIENT_SECRET)`. Config
changes only take effect on restart:

```bash
npx supabase stop
npx supabase start
```

## 4. Try it

```bash
npm run dev
```

Visit `http://localhost:3000/admin/candidates` and click "Sign in with
Google". After Google's consent screen, you should land back on
`/admin/candidates` signed in - the header shows "Signed in as
{your email} · Sign out" and the review queue renders. Signing in with any
other Google account should still show the "Admin sign-in required" gate
(the account is authenticated but not authorized).

## What was NOT verified by the agent that built this

Full sign-in end-to-end was **not** tested in the environment that
implemented issue #67 - there were no real Google OAuth credentials
available there. What _was_ verified live in that environment:

- `/admin/candidates` renders the sign-in gate (not the review queue) with
  no session.
- `approveCandidateAction`/`rejectCandidateAction` both reject
  (`"Not authorized"`) when called with no valid session.
- The app builds, type-checks, and lints cleanly with the auth code in
  place.

Only a real successful Google sign-in (steps 1-4 above) can confirm the
OAuth redirect flow, the Supabase Auth callback, and the
`ADMIN_ALLOWED_EMAIL` match actually work end-to-end - do that once after
following this doc.
