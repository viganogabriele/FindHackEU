import { defaultTopicExtractor } from "@/lib/topic-extractor";
import type { HackathonTopic } from "@/lib/constants/topics";
import type {
  Provider,
  ProviderResult,
  ParseStatus,
  DroppedCounts,
} from "@/lib/providers/provider.interface";

export type {
  ParseStatus,
  DroppedCounts,
} from "@/lib/providers/provider.interface";

export interface ParsedHackathon {
  name: string;
  city?: string;
  country_code?: string;
  /** Coordinates used by the public radius filter (issue #109). */
  latitude?: number;
  longitude?: number;
  /**
   * Lightweight confidence marker for `country_code` (issue #5). Kept
   * in-memory only, not persisted to the DB, to avoid a schema change.
   * "high" = the country came straight from the source's own structured
   * data. "low" = it was inferred heuristically (known-city lookup or
   * geocoding) and could be wrong for ambiguous/misspelled input.
   * Undefined = no country could be determined at all.
   */
  location_confidence?: "high" | "low";
  /**
   * Physical/online/hybrid/unannounced (issue #21). Optional here because
   * not every parser has a reliable source signal for it - `route.ts`
   * defaults a missing value to `"tbd"` at write time, same as the DB
   * column's own default, rather than each parser having to repeat that
   * fallback.
   */
  location_type?: "physical" | "online" | "hybrid" | "tbd";
  /** Optional free-text campus/building detail (issue #21). */
  venue?: string;
  date_start: Date;
  date_end?: Date;
  topics?: HackathonTopic[];
  notes?: string;
  /** Optional image URL already present in the source discovery payload. */
  preview_image_url?: string;
  url: string;
  source: string;
  /**
   * Additional source URLs recognized as referring to this same event
   * during in-process dedup (see lib/dedup/dedupe-hackathons.ts and issue
   * #22). In-memory provenance only — deliberately NOT part of the
   * database schema/insert payload. Persisting this (e.g. a
   * `hackathon_sources` table) is deferred to issue #24 (DB schema
   * versioning), which needs the maintainer's own Supabase instance to
   * design and test a migration against.
   */
  alternateUrls?: string[];
}

/**
 * Result of a provider's own `discover()` implementation: its raw
 * hackathons plus an honest per-run status. This is intentionally a
 * smaller shape than `ProviderResult` (no `success`/`count`) - those are
 * mechanically derivable from `hackathons`/`status` and are added once, in
 * `BaseParser.parse()`, so every provider doesn't have to recompute them.
 */
export interface DiscoverResult {
  hackathons: ParsedHackathon[];
  errors: string[];
  status: ParseStatus;
  /** Per-stage rejection counts observed while discovering this run (issue #31). */
  dropped?: DroppedCounts;
}

/**
 * Shared base for every `Provider` implementation.
 *
 * Subclasses implement `discover()` with their source-specific
 * fetch/normalize logic (as `parse()` used to do before the `Provider`
 * interface existed) and declare `name`/`enabled`. `discover()` is
 * responsible for its own honest per-unit error handling (e.g. per-slug
 * try/catch) and must never let "zero real results" and "everything
 * failed" collapse into the same `status`. `BaseParser.parse()` wraps
 * `discover()`'s result (or a thrown error, for a provider that couldn't
 * even start) into the standard `ProviderResult` shape so every source is
 * uniform from the orchestrator's point of view.
 */
export abstract class BaseParser implements Provider {
  abstract readonly name: string;
  abstract readonly enabled: boolean;

  protected abstract discover(): Promise<DiscoverResult>;

  async parse(): Promise<ProviderResult> {
    try {
      const { hackathons, errors, status, dropped } = await this.discover();

      return {
        hackathons,
        success: status !== "failed",
        status,
        count: hackathons.length,
        errors,
        dropped,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        hackathons: [],
        success: false,
        status: "failed",
        count: 0,
        errors: [message],
      };
    }
  }

  protected formatDate(
    start_date_str: string,
    end_date_str?: string,
  ): { start: Date; end?: Date } {
    try {
      if (start_date_str === "N/A") throw new Error("Invalid start date");

      const parseDateWithTimezone = (value: string, label: string): Date => {
        if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
          throw new Error(`${label} requires an explicit timezone`);
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          throw new Error(`Invalid ${label.toLowerCase()}: ${value}`);
        }

        return date;
      };

      const start = parseDateWithTimezone(start_date_str, "Start date");

      // `new Date("garbage")` does NOT throw - it silently produces an
      // "Invalid Date" whose comparisons/`.toISOString()` calls fail (or
      // worse, silently misbehave: any comparison against it is always
      // `false`) much later, far from this actually-bad input. Catch it
      // here instead, so the existing per-event try/catch upstream (e.g.
      // LumaParser.mapEventToHackathon) drops just this one malformed
      // event instead of an Invalid Date reaching route.ts's batch insert
      // and throwing there, which would fail the ENTIRE batch, not just
      // the one bad row (found in code review).
      const end =
        end_date_str && end_date_str !== "N/A"
          ? parseDateWithTimezone(end_date_str, "End date")
          : undefined;

      return { start, end };
    } catch (error) {
      console.error(
        `Error parsing dates: ${start_date_str}, ${end_date_str}`,
        error,
      );
      const reason = error instanceof Error ? `: ${error.message}` : "";
      throw new Error(
        `Error parsing dates: ${start_date_str}, ${end_date_str}${reason}`,
      );
    }
  }

  /**
   * Extract topics from hackathon content using unified topic extractor
   * @param name Hackathon name
   * @param description Optional description
   * @param additionalText Any additional text to analyze
   * @returns Array of standardized topic names
   */
  protected extractTopics(
    name: string,
    description?: string,
    additionalText?: string,
  ): HackathonTopic[] {
    return defaultTopicExtractor.extractTopics(
      name,
      description,
      additionalText,
    );
  }
}
