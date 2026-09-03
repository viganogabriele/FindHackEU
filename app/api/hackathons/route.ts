import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/services/fetch-all-rows";
import { parseHackathonsQuery } from "@/lib/api/hackathons-query";
import { createRateLimiter, getClientKey } from "@/lib/http/rate-limit";

// This rate limit protects the PUBLIC read API from abuse in production -
// it has nothing to do with Luma/Devfolio/MLH/etc: those provider APIs are
// only ever called server-side, once a day, by the discovery pipeline
// (app/api/update/route.ts), never from a browser and never subject to this
// limiter. In local development, the same browser tab (and any tooling
// hitting localhost) shares one IP with itself, so the production-tuned
// burst limit trips almost immediately during normal testing - skip it
// entirely outside production rather than raising it to an arbitrary
// larger number that would still eventually trip during a real dev session.
const isProduction = process.env.NODE_ENV === "production";

const hourlyRateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 100,
});
const burstRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10,
});

export async function GET(request: Request) {
  const ip = getClientKey(request);
  const hourlyRateLimit = hourlyRateLimiter.check(ip);
  const burstRateLimit = burstRateLimiter.check(ip);
  const rateLimit = hourlyRateLimit.allowed ? burstRateLimit : hourlyRateLimit;

  if (isProduction && !rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": Math.ceil(
            (rateLimit.resetAt! - Date.now()) / 1000,
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
        "id, name, city, country_code, latitude, longitude, location_type, venue, date_start, date_end, topics, notes, url, status, is_new, source",
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

    const body = JSON.stringify({
      data,
      ...(limit !== null ? { nextCursor } : {}),
    });

    // Derived from the response body, so it only changes when the response
    // actually does. The previous value embedded `Date.now()`, which made it
    // unique per response: no `If-None-Match` could ever match it, so a
    // conditional request never got a 304 and every CDN revalidation after
    // `s-maxage` re-transferred the whole list instead of confirming it was
    // unchanged - the exact thing an ETag exists to avoid.
    const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;

    const headers = {
      // Cache for 5 minutes, serve stale for up to 10 minutes while revalidating
      "Cache-Control": "s-maxage=300, stale-while-revalidate=600",
      // CDN specific caching
      "CDN-Cache-Control": "max-age=300",
      "Vercel-CDN-Cache-Control": "max-age=300",
      ETag: etag,
      // No `Vary` header: this response depends only on the query string,
      // which is already part of every cache key. The previous
      // `Vary: Accept, Authorization` varied on two headers the handler
      // never reads, and `Vary: Authorization` in particular tells shared
      // caches to be careful with a response that is identical for
      // everybody.
    };

    // Honour a conditional request. A 304 must not carry a body, and
    // repeats the caching headers so an intermediary can refresh its own
    // freshness bookkeeping.
    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers });
    }

    return new NextResponse(body, {
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching hackathons:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
