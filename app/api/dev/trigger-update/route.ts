import { NextResponse } from "next/server";

/**
 * Dev-only convenience endpoint backing the Sidebar's "Trigger update"
 * button (see components/sidebar.tsx). It exists so a developer running
 * the app locally can kick off the discovery pipeline from the UI instead
 * of a separate terminal command, without ever exposing CRON_SECRET to the
 * client - this route reads it server-side and forwards the request.
 *
 * Hard-disabled outside development, regardless of whether the button
 * itself is ever accidentally left rendered in a production build: this
 * is a convenience trigger, not something that should ever be reachable
 * on a real deployment.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available outside development" },
      { status: 404 },
    );
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
