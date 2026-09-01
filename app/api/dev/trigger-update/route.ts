import { NextResponse } from "next/server";
import { requireAdminAuth } from "@/lib/services/require-admin-auth";

/**
 * Dev-only convenience endpoint backing the admin dashboard's "Trigger
 * update" button (see app/admin/trigger-update-button.tsx, previously in
 * the public sidebar - see issue #81). It exists so a developer running
 * the app locally can kick off the discovery pipeline from the UI instead
 * of a separate terminal command, without ever exposing CRON_SECRET to the
 * client - this route reads it server-side and forwards the request.
 *
 * Hard-disabled outside development, regardless of whether the button
 * itself is ever accidentally left rendered in a production build: this
 * is a convenience trigger, not something that should ever be reachable
 * on a real deployment.
 *
 * Also re-checks real admin auth server-side (issue #81), mirroring
 * app/admin/candidates/actions.ts's `assertAuthorized()` pattern - the
 * button now only renders on the authenticated /admin dashboard, but that
 * alone doesn't stop a direct POST to this route from anyone running the
 * app locally (previously gated only by NODE_ENV, weaker than real admin
 * auth). This is the route's own security boundary, not just a UI hint.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available outside development" },
      { status: 404 },
    );
  }

  try {
    await requireAdminAuth();
  } catch {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const updateUrl = new URL("/api/update", request.url);

  const response = await fetch(updateUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
      // Always test mode from the UI button - a stray click should never
      // send real Discord/Telegram/Twitter notifications or commit a
      // README change. Use `npm run trigger-update -- --live` for that.
      "x-test-mode": "true",
    },
  });

  const body = await response.json();

  return NextResponse.json(body, { status: response.status });
}
