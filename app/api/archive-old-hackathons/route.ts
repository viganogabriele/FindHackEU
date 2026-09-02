import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sweepOldPastHackathons } from "@/lib/services/retention-sweep";

/**
 * Issue #72 follow-up (2026-09-01): automatic retention sweep, archiving any
 * `hackathons` row with `status = "past"` more than a year past its
 * `date_end` (or `date_start` if no end date). Deliberately its own route,
 * called weekly by its own workflow (.github/workflows/archive-old-hackathons.yml),
 * rather than folded into app/api/update/route.ts - the main pipeline's
 * behavior (scrape/dedupe/notify) must stay untouched by this, a distinct
 * concern that only needs to run occasionally (weekly is plenty; nothing
 * ages into "more than a year past" between one run and the next).
 *
 * A workflow's `on.schedule` applies to the whole workflow, not to
 * individual jobs, which is why this is a separate file rather than an
 * extra job inside update.yml.
 *
 * Auth mirrors app/api/update/route.ts's CRON_SECRET bearer-token check
 * exactly, including failing closed if the env var itself isn't configured
 * (never comparing against a literal "Bearer undefined").
 */
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("CRON_SECRET is not configured - rejecting all requests.");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization");

  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sweepOldPastHackathons(supabaseAdmin);

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error running retention archive sweep:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
