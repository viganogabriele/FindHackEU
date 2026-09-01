import type { ParsedHackathon } from "@/lib/parsers/base-parser";

/**
 * Explicit outcome of a single provider's run.
 *
 * - "ok": every unit of work (e.g. slug/category) the provider attempted
 *   succeeded. Zero matching hackathons is still "ok" as long as nothing
 *   errored.
 * - "partial": at least one unit succeeded and at least one failed - real
 *   data came back, but it's known-incomplete. Distinct from `success`
 *   (which stays `true` for "partial", since the data is still usable)
 *   so callers can tell a fully clean run apart from a degraded one
 *   instead of that distinction disappearing into a single boolean
 *   (found in code review).
 * - "failed": every unit attempted failed (or the provider could not
 *   attempt any work at all).
 */
export type ParseStatus = "ok" | "partial" | "failed";

/**
 * Per-stage rejection counts for a single provider's run (issue #31).
 *
 * All fields optional/additive so this can be layered onto the existing
 * `DiscoverResult`/`ProviderResult` contract without touching every call
 * site that already destructures those shapes:
 *
 * - `byClassifier`: raw candidates rejected by a classify-vs-reject step
 *   (only Luma has one today - its API isn't already scoped to
 *   "hackathons", unlike Devfolio/MLH/ETHGlobal, so this is omitted/
 *   undefined for those three rather than fabricating a classify stage
 *   that doesn't exist for them).
 * - `byDateWindow`: candidates whose start date fell outside the
 *   configured future-date window (`lib/config/discovery-config.ts`).
 * - `byCountry`: candidates dropped because their source-reported country
 *   was explicitly non-European (`lib/european-countries.ts`).
 *
 * Deliberately does NOT include a duplicates count - cross-source dedup
 * happens once, after every provider has already run
 * (`mergeHackathonDuplicates` in `app/api/update/route.ts`), so it isn't
 * attributable to any single provider and is tracked separately there.
 */
export interface DroppedCounts {
  byClassifier?: number;
  byDateWindow?: number;
  byCountry?: number;
}

/**
 * Standard result shape every `Provider` returns from `parse()`.
 *
 * This lets the orchestrator (`app/api/update/route.ts`) treat every
 * source uniformly instead of branching on the concrete parser class.
 */
export interface ProviderResult {
  hackathons: ParsedHackathon[];
  success: boolean;
  status: ParseStatus;
  count: number;
  errors: string[];
  /** Per-stage rejection counts observed while discovering this run (issue #31). */
  dropped?: DroppedCounts;
}

/**
 * Contract every hackathon source (Luma, Lablab, future sources)
 * must implement to be registered in the orchestrator's provider
 * array.
 *
 * Adding a new source should mean "create a class implementing this
 * interface and add an instance to the `providers` array in
 * `app/api/update/route.ts`" - no other change to the orchestrator
 * should be required.
 */
export interface Provider {
  /** Stable identifier used as the key in `sourceResults`/diagnostics. */
  readonly name: string;

  /** Whether this provider should be invoked by the orchestrator. */
  readonly enabled: boolean;

  /** Fetch and normalize hackathons from this source. */
  parse(): Promise<ProviderResult>;
}
