import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Query builders backing /admin/candidates's five tabs (issue #102).
 * Factored out of page.tsx into their own pure functions (dependency-
 * injected Supabase client, not the module-level `supabaseAdmin` singleton)
 * specifically so the union-query shape - the exact filters/order each tab
 * sends to Supabase - can be asserted directly in tests against a mocked
 * chainable query builder, the same pattern
 * app/api/hackathons/__tests__/archived-exclusion.test.ts already
 * established, rather than only being exercised indirectly through
 * rendering the page.
 *
 * Every tab is a union of up to two sources - `hackathon_candidates` (the
 * not-yet-published review queue) and `hackathons` (every published row,
 * regardless of origin) - except Approved/Past/Archived, which are
 * `hackathons`-only (a `hackathon_candidates` row is never "published" by
 * definition; see page.tsx's doc comment for the full per-tab breakdown).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

type QueryOptions = {
  countOnly?: boolean;
};

function selectRows(
  client: AnySupabaseClient,
  table: "hackathon_candidates" | "hackathons",
  countOnly: boolean,
) {
  return countOnly
    ? client.from(table).select("id", { count: "exact", head: true })
    : client.from(table).select("*");
}

/**
 * Issue #83's multi-field search (name/city/country/query), quoted for
 * PostgREST's comma-separated `.or()` filter list - unchanged from the
 * pre-issue-#102 candidate search, just extracted so both the candidate- and
 * hackathon-sourced halves of a union tab can share it.
 */
export function candidateSearchOrFilter(query: string): string {
  const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const pattern = `"%${escaped}%"`;
  return `name.ilike.${pattern},city.ilike.${pattern},country_code.ilike.${pattern},query.ilike.${pattern}`;
}

/**
 * `hackathon_candidates` half of the Pending/Rejected union - identical to
 * the query the pre-#102 standalone Pending/Rejected tabs already ran,
 * unchanged.
 */
export function candidatesByStatusQuery(
  client: AnySupabaseClient,
  status: "pending" | "rejected",
  query: string,
  options: QueryOptions = {},
) {
  const countOnly = options.countOnly ?? false;
  let q = selectRows(client, "hackathon_candidates", countOnly).eq(
    "status",
    status,
  );

  if (!countOnly) {
    q = q.order("created_at", { ascending: false }).limit(200);
  }

  if (query) {
    q = q.or(candidateSearchOrFilter(query));
  }

  return q;
}

export function candidatesByStatusCountQuery(
  client: AnySupabaseClient,
  status: "pending" | "rejected",
  query: string,
) {
  return candidatesByStatusQuery(client, status, query, { countOnly: true });
}

/**
 * `hackathons` half of the Pending/Rejected union - every published
 * hackathon the maintainer has moved to that moderation state, regardless of
 * origin. Search is name-only (`.ilike`), matching how every other
 * hackathons-table query on this page has always searched - a hackathon row
 * has no `query`/`search_provider` field to search across the way a
 * candidate row does.
 */
export function hackathonsByModerationStateQuery(
  client: AnySupabaseClient,
  moderationState: "pending" | "rejected",
  query: string,
  options: QueryOptions = {},
) {
  const countOnly = options.countOnly ?? false;
  let q = selectRows(client, "hackathons", countOnly)
    .eq("moderation_state", moderationState)
    // An automatically archived row belongs only in the Archived tab, even
    // if its moderation state is still pending or rejected.
    .is("archived_at", null);

  if (!countOnly) {
    q = q.order("created_at", { ascending: false }).limit(200);
  }

  if (query) {
    q = q.ilike("name", `%${query}%`);
  }

  return q;
}

export function hackathonsByModerationStateCountQuery(
  client: AnySupabaseClient,
  moderationState: "pending" | "rejected",
  query: string,
) {
  return hackathonsByModerationStateQuery(client, moderationState, query, {
    countOnly: true,
  });
}

/**
 * The Approved/Past split (issue #102's design decision, documented in full
 * in the PR body): both are `hackathons` rows with
 * `moderation_state = 'approved'` and `archived_at is null` - "not currently
 * moderated away, not archived" - differing only in whether the event is
 * upcoming or over.
 *
 * `status = 'estimated'` (set when a candidate is promoted with no resolved
 * date - see promote-candidate.ts) is deliberately folded into whichever of
 * Approved/Past its `date_start` falls into, compared against `now`, instead
 * of being its own tab/category - the maintainer explicitly doesn't want to
 * think about "estimated" as a separate thing (issue #102). Note
 * `update_hackathon_statuses()` (supabase/migrations/20260101000000_init.sql)
 * only ever recomputes `'upcoming'`/`'past'` rows, never `'estimated'` ones,
 * so this date comparison is the only place that split ever gets decided for
 * an estimated row - it is NOT flipped to a real status by that RPC.
 */
export function approvedOrPastHackathonsQuery(
  client: AnySupabaseClient,
  kind: "approved" | "past",
  query: string,
  now: Date = new Date(),
  options: QueryOptions = {},
) {
  const countOnly = options.countOnly ?? false;
  const nowIso = now.toISOString();

  let q = selectRows(client, "hackathons", countOnly)
    .eq("moderation_state", "approved")
    // Issue #72: an archived hackathon moves to the Archived tab, not this
    // one - without this filter it would show up in both.
    .is("archived_at", null);

  if (!countOnly) {
    q = q.order("date_start", { ascending: kind === "approved" }).limit(200);
  }

  q =
    kind === "approved"
      ? q.or(
          `status.eq.upcoming,and(status.eq.estimated,date_start.gte.${nowIso})`,
        )
      : q.or(`status.eq.past,and(status.eq.estimated,date_start.lt.${nowIso})`);

  if (query) {
    q = q.ilike("name", `%${query}%`);
  }

  return q;
}

export function approvedOrPastHackathonsCountQuery(
  client: AnySupabaseClient,
  kind: "approved" | "past",
  query: string,
  now: Date = new Date(),
) {
  return approvedOrPastHackathonsQuery(client, kind, query, now, {
    countOnly: true,
  });
}

/**
 * The Archived tab (issue #72, corrected by issue #102): purely
 * `hackathons` rows with `archived_at is not null`. As of issue #102 this no
 * longer also surfaces rejected candidates - PR #101 merged them into one
 * tab, but the maintainer clarified afterward that Rejected (editorial "no")
 * and Archived (date-based retention) are distinct concepts and must be
 * separate tabs; rejected candidates now live only in the Rejected tab
 * (`candidatesByStatusQuery(client, "rejected", query)`), unioned there with
 * `hackathons` rows the maintainer explicitly rejected post-publication
 * (`hackathonsByModerationStateQuery(client, "rejected", query)`).
 */
export function archivedHackathonsQuery(
  client: AnySupabaseClient,
  query: string,
  options: QueryOptions = {},
) {
  const countOnly = options.countOnly ?? false;
  let q = selectRows(client, "hackathons", countOnly).not(
    "archived_at",
    "is",
    null,
  );

  if (!countOnly) {
    q = q.order("archived_at", { ascending: false }).limit(200);
  }

  if (query) {
    q = q.ilike("name", `%${query}%`);
  }

  return q;
}

export function archivedHackathonsCountQuery(
  client: AnySupabaseClient,
  query: string,
) {
  return archivedHackathonsQuery(client, query, { countOnly: true });
}
