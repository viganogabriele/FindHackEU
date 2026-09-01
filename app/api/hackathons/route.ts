import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/services/fetch-all-rows";
import { parseHackathonsQuery } from "@/lib/api/hackathons-query";

// Rate limiting storage (in production, use Redis or similar)
const rateLimitMap = new Map<
  string,
  { count: number; lastReset: number; burst: number; lastBurst: number }
>();

function getRateLimitKey(request: Request): string {
  // `x-forwarded-for` can be a comma-separated chain built by every proxy
  // the request passed through, with the CLIENT'S OWN claimed value first
  // and each trusted proxy appending its hop after. Taking the first entry
  // (found in code review) let any client bypass rate limiting entirely by
  // just sending a different fake IP as this header on every request.
  // Taking the LAST entry instead reflects the hop closest to our own
  // server - the one, if any, actually added by a trusted reverse proxy
  // (e.g. Vercel's edge network) rather than client-supplied input. This
  // still assumes a trusted proxy sits in front of the app; it cannot make
  // the header trustworthy on a deployment with no such proxy at all.
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",").pop()?.trim()
    : request.headers.get("x-real-ip");
  return ip || "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; resetTime?: number } {
  const now = Date.now();
  const hourWindow = 60 * 60 * 1000; // 1 hour
  const minuteWindow = 60 * 1000; // 1 minute

  const current = rateLimitMap.get(ip) || {
    count: 0,
    lastReset: now,
    burst: 0,
    lastBurst: now,
  };

  // Reset hourly counter
  if (now - current.lastReset >= hourWindow) {
    current.count = 0;
    current.lastReset = now;
  }

  // Reset burst counter
  if (now - current.lastBurst >= minuteWindow) {
    current.burst = 0;
    current.lastBurst = now;
  }

  // Check limits
  if (current.count >= 100) {
    return { allowed: false, resetTime: current.lastReset + hourWindow };
  }

  if (current.burst >= 10) {
    return { allowed: false, resetTime: current.lastBurst + minuteWindow };
  }

  // Increment counters
  current.count++;
  current.burst++;
  rateLimitMap.set(ip, current);

  return { allowed: true };
}

export async function GET(request: Request) {
  const ip = getRateLimitKey(request);
  const rateLimit = checkRateLimit(ip);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(
            (rateLimit.resetTime! - Date.now()) / 1000,
          ).toString(),
        },
      },
    );
  }

  const parsedQuery = parseHackathonsQuery(request);
  if (!parsedQuery.ok) {
    return NextResponse.json({ error: parsedQuery.message }, { status: 400 });
  }

  const { status, ascending, limit, cursor } = parsedQuery.value;

  try {
    let query = supabase
      .from("hackathons")
      .select(
        "id, name, city, country_code, latitude, longitude, location_type, venue, date_start, date_end, topics, notes, preview_image_url, url, status, is_new, source",
      )
      .eq("status", status)
      // Issue #72: an archived hackathon (manual "Archive" action, or the
      // automatic retention sweep) is a soft-delete - it must never appear
      // in the public listing, same as if it had been hard-deleted, while
      // staying recoverable from the admin Archived tab.
      .is("archived_at", null)
      // Issue #102: a hackathon moved to "pending" or "rejected" from the
      // admin's unified moderation UI must disappear from the public site
      // immediately, same as archived_at already does above - these are two
      // independent exclusion filters (moderation is an editorial decision,
      // archival is date-based retention), both required for a row to be
      // public.
      .eq("moderation_state", "approved")
      // `id` as a secondary, always-unique tie-breaker so rows sharing
      // a `date_start` can't land inconsistently across a page boundary
      // (found in code review).
      .order("date_start", { ascending })
      .order("id", { ascending: true });

    if (cursor) {
      // Row-value comparison "(date_start, id) > (cursor.dateStart, cursor.id)"
      // (or "<" when sorting descending) expressed as the equivalent
      // `.or()` filter PostgREST supports: strictly past the cursor's
      // date_start, OR tied on date_start and past its id.
      const op = ascending ? "gt" : "lt";
      query = query.or(
        `date_start.${op}.${cursor.dateStart},and(date_start.eq.${cursor.dateStart},id.gt.${cursor.id})`,
      );
    }

    let data;
    let nextCursor: string | null = null;

    if (limit !== null) {
      const { data: page, error } = await query.limit(limit + 1);
      if (error) throw error;

      // Cast, not trusted Supabase inference - a direct `.select()` result
      // resolves to `never` in this project's current client setup (same
      // rough edge documented in lib/services/promote-candidate.ts).
      const rows = (page ?? []) as Array<{ date_start: string; id: string }>;
      const hasMore = rows.length > limit;
      data = hasMore ? rows.slice(0, limit) : rows;

      const last = data[data.length - 1];
      if (hasMore && last) {
        nextCursor = Buffer.from(
          `${last.date_start}|${last.id}`,
          "utf-8",
        ).toString("base64url");
      }
    } else {
      // No `limit` - preserve the exact previous behavior (full dataset
      // via fetchAllRows, see lib/services/fetch-all-rows.ts) rather than
      // silently truncating existing consumers that don't pass `limit`.
      data = await fetchAllRows((from, to) => query.range(from, to));
    }

    return NextResponse.json(
      {
        data,
        ...(limit !== null ? { nextCursor } : {}),
      },
      {
        headers: {
          // Cache for 5 minutes, serve stale for up to 10 minutes while revalidating
          "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
          // CDN specific caching
          "CDN-Cache-Control": "max-age=300",
          "Vercel-CDN-Cache-Control": "max-age=300",
          // Add ETag for conditional requests
          ETag: `"hackathons-${status}-${Date.now()}"`,
          // Vary by status parameter
          Vary: "Accept, Authorization",
        },
      },
    );
  } catch (error) {
    console.error("Error fetching hackathons:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
