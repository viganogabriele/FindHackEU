/**
 * PostgREST (the API layer Supabase's JS client talks to) caps how many
 * rows a single request returns (`max_rows` in `supabase/config.toml`,
 * 1000 for local dev) - a plain `.select(...)` with no `.range()` silently
 * truncates once the table exceeds that cap, instead of erroring. Every
 * unpaginated query in this codebase (the update route's existing-row
 * fetch, `LocationEnhancementService.getExistingUrls`, and the public
 * `/api/hackathons` endpoint) inherited this bug (found in code review):
 * past ~1000 rows, dedup/update logic starts missing known rows (risking
 * duplicate inserts) and the public API starts silently dropping
 * hackathons from its response.
 *
 * This fetches every row by paging through `.range()` until a
 * less-than-full page comes back, so callers never have to think about
 * the underlying row cap.
 */
export async function fetchAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  // Safety valve against ever looping forever on an unexpected API
  // response shape - a real table would need >100M rows to hit this.
  const maxPages = 100_000;

  for (let page = 0; page < maxPages; page++) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    allRows.push(...rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}
