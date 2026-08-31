import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/services/fetch-all-rows";

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

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") || "upcoming";

  try {
    // Paginated (see lib/services/fetch-all-rows.ts): a plain, unpaginated
    // select silently truncates once the table exceeds PostgREST's
    // max_rows, which would make this endpoint quietly drop hackathons
    // from its response with no error (found in code review).
    const data = await fetchAllRows((from, to) =>
      supabase
        .from("hackathons")
        .select(
          "id, name, city, country_code, date_start, date_end, topics, notes, url, status, is_new, source",
        )
        .eq("status", status)
        // `id` as a secondary, always-unique tie-breaker so rows sharing
        // a `date_start` can't land inconsistently across a page boundary
        // (found in code review).
        .order("date_start", { ascending: status === "upcoming" })
        .order("id", { ascending: true })
        .range(from, to),
    );

    return NextResponse.json(
      {
        data,
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
