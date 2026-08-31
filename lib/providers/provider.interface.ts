import type { ParsedHackathon } from "@/lib/parsers/base-parser";

/**
 * Standard result shape every `Provider` returns from `parse()`.
 *
 * This lets the orchestrator (`app/api/update/route.ts`) treat every
 * source uniformly instead of branching on the concrete parser class.
 */
export interface ProviderResult {
  hackathons: ParsedHackathon[];
  success: boolean;
  count: number;
  errors: string[];
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
