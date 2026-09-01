export const HACKATHON_STATUSES = ["upcoming", "past", "estimated"] as const;

export type HackathonStatus = (typeof HACKATHON_STATUSES)[number];

/**
 * Keep one row available for the look-ahead fetch used to create nextCursor.
 * This is below Supabase's local 1000-row response cap, so a page can always
 * distinguish "exactly full" from "there is another row".
 */
export const MAX_HACKATHON_PAGE_SIZE = 100;

export interface HackathonsCursor {
  dateStart: string;
  id: string;
}

export interface HackathonsQuery {
  status: HackathonStatus;
  ascending: boolean;
  limit: number | null;
  cursor: HackathonsCursor | null;
}

export type HackathonsQueryResult =
  | { ok: true; value: HackathonsQuery }
  | { ok: false; message: string };

const RFC3339_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseCursor(raw: string): HackathonsCursor | null {
  // Buffer's base64 decoder is intentionally permissive. Requiring the
  // canonical base64url spelling prevents malformed values from silently
  // decoding to a different payload.
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) {
    return null;
  }

  const decoded = Buffer.from(raw, "base64url").toString("utf8");
  if (Buffer.from(decoded, "utf8").toString("base64url") !== raw) {
    return null;
  }

  const fields = decoded.split("|");
  if (fields.length !== 2) {
    return null;
  }

  const [dateStart, id] = fields;
  if (
    !RFC3339_TIMESTAMP.test(dateStart) ||
    Number.isNaN(Date.parse(dateStart)) ||
    !UUID.test(id)
  ) {
    return null;
  }

  return { dateStart, id };
}

export function parseHackathonsQuery(request: Request): HackathonsQueryResult {
  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status") ?? "upcoming";

  if (!HACKATHON_STATUSES.includes(rawStatus as HackathonStatus)) {
    return { ok: false, message: "Invalid 'status' query parameter" };
  }

  const status = rawStatus as HackathonStatus;
  const limitParam = searchParams.get("limit");
  let limit: number | null = null;

  if (limitParam !== null) {
    if (!/^[1-9]\d*$/.test(limitParam)) {
      return { ok: false, message: "Invalid 'limit' query parameter" };
    }

    const parsedLimit = Number(limitParam);
    if (
      !Number.isSafeInteger(parsedLimit) ||
      parsedLimit > MAX_HACKATHON_PAGE_SIZE
    ) {
      return { ok: false, message: "Invalid 'limit' query parameter" };
    }

    limit = parsedLimit;
  }

  const cursorParam = searchParams.get("cursor");
  const cursor = cursorParam === null ? null : parseCursor(cursorParam);

  if (cursorParam !== null && !cursor) {
    return { ok: false, message: "Invalid 'cursor' query parameter" };
  }

  return {
    ok: true,
    value: {
      status,
      ascending: status === "upcoming",
      limit,
      cursor,
    },
  };
}
