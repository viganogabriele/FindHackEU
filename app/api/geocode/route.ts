import { NextResponse } from "next/server";
import { GeocodingService } from "@/lib/services/geocoding-service";

const MAX_QUERY_LENGTH = 120;
const RATE_LIMIT_PER_HOUR = 10;
const CACHE_TTL_MS = 60 * 60 * 1000;

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const coordinateCache = new Map<
  string,
  { latitude: number; longitude: number; expiresAt: number }
>();

function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",").pop()?.trim()
    : request.headers.get("x-real-ip");
  return ip || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const current = rateLimitMap.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitMap.set(key, {
      count: 1,
      resetAt: now + 60 * 60 * 1000,
    });
    return false;
  }

  if (current.count >= RATE_LIMIT_PER_HOUR) {
    return true;
  }

  current.count++;
  return false;
}

export async function GET(request: Request) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json(
      { error: "Too many location searches. Please try again later." },
      { status: 429 },
    );
  }

  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: `Location must be between 2 and ${MAX_QUERY_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  const cacheKey = query.toLocaleLowerCase();
  const cached = coordinateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({
      data: {
        query,
        latitude: cached.latitude,
        longitude: cached.longitude,
      },
    });
  }

  const outcome = await GeocodingService.getCoordinatesFromAddress(query);
  if (
    (outcome.status !== "found" && outcome.status !== "non_european") ||
    outcome.latitude === undefined ||
    outcome.longitude === undefined
  ) {
    const status = outcome.status === "unavailable" ? 503 : 404;
    return NextResponse.json(
      {
        error:
          status === 503
            ? "Location search is temporarily unavailable."
            : "Location not found.",
      },
      { status },
    );
  }

  const data = {
    query,
    latitude: outcome.latitude,
    longitude: outcome.longitude,
  };
  coordinateCache.set(cacheKey, {
    latitude: outcome.latitude,
    longitude: outcome.longitude,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return NextResponse.json({ data });
}
