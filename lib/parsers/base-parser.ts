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
  date_start: Date;
  date_end?: Date;
  topics?: HackathonTopic[];
  notes?: string;
  url: string;
  source: string;
}

/**
 * Shared base for every `Provider` implementation.
 *
 * Subclasses implement `discover()` with their source-specific
 * fetch/normalize logic (as `parse()` used to do before the
 * `Provider` interface existed) and declare `name`/`enabled`.
 * `BaseParser` wraps `discover()`'s result (or thrown error) into
 * the standard `ProviderResult` shape so every source is uniform
 * from the orchestrator's point of view.
 */
export abstract class BaseParser implements Provider {
  abstract readonly name: string;
  abstract readonly enabled: boolean;

  /**
   * Source-specific fetch/normalize logic. This is exactly what
   * `parse()` used to be before this class implemented `Provider` -
   * subclasses keep their existing internal error handling as-is.
   */
  protected abstract discover(): Promise<ParsedHackathon[]>;

  async parse(): Promise<ProviderResult> {
    try {
      const hackathons = await this.discover();

      return {
        hackathons,
        success: true,
        count: hackathons.length,
        errors: [],
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
