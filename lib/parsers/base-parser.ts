import { defaultTopicExtractor } from "@/lib/topic-extractor";
import type { HackathonTopic } from "@/lib/constants/topics";
import type {
  Provider,
  ProviderResult,
} from "@/lib/providers/provider.interface";

export interface ParsedHackathon {
  name: string;
  city?: string;
  country_code?: string;
  /**
   * Lightweight confidence marker for `country_code` (issue #5). Kept
   * in-memory only, not persisted to the DB, to avoid a schema change.
   * "high" = the country came straight from the source's own structured
   * data. "low" = it was inferred heuristically (known-city lookup or
   * geocoding) and could be wrong for ambiguous/misspelled input.
   * Undefined = no country could be determined at all.
   */
  location_confidence?: "high" | "low";
  date_start: Date;
  date_end?: Date;
  topics?: HackathonTopic[];
  notes?: string;
  url: string;
  source: string;
}

/**
 * Explicit outcome of a single provider's `discover()` run.
 *
 * - "ok": every unit of work (e.g. slug/category) the provider
 *   attempted succeeded. Zero matching hackathons is still "ok"
 *   as long as nothing errored.
 * - "partial": at least one unit succeeded and at least one failed.
 * - "failed": every unit attempted failed (or the provider could
 *   not attempt any work at all, e.g. it couldn't authenticate).
 *
 * This lets callers distinguish "genuinely zero results this run"
 * from "the provider is broken" instead of inferring success from
 * whether an exception happened to propagate out of `parse()`.
 */
export type ParseStatus = "ok" | "partial" | "failed";

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
      const { hackathons, errors, status } = await this.discover();

      return {
        hackathons,
        success: status !== "failed",
        count: hackathons.length,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        hackathons: [],
        success: false,
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

      const start = new Date(start_date_str.replace("Z", "+00:00"));
      const end =
        end_date_str && end_date_str !== "N/A"
          ? new Date(end_date_str.replace("Z", "+00:00"))
          : undefined;

      return { start, end };
    } catch (error) {
      console.error(
        `Error parsing dates: ${start_date_str}, ${end_date_str}`,
        error,
      );
      throw new Error(
        `Error parsing dates: ${start_date_str}, ${end_date_str}`,
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
