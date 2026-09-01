import { supabaseAdmin } from "@/lib/supabase";
import { europeanCountries } from "@/lib/european-countries";
import { HACKATHON_TOPICS, type HackathonTopic } from "@/lib/constants/topics";

export interface ManualCandidateInput {
  url: string;
  name: string;
  city?: string;
  countryCode?: string;
  dateStart?: string;
  /**
   * Explicitly chosen by the submitter - a human who already knows the
   * event is a much better source of truth than auto-extracting from a
   * short title, which `promoteCandidate()` only falls back to when this
   * is empty/omitted.
   */
  topics?: string[];
}

export type SubmitManualCandidateResult =
  | { outcome: "created" }
  | { outcome: "invalid"; message: string }
  | { outcome: "error"; message: string };

/**
 * Lets a human hand-submit an event URL straight into the same review
 * queue web-search discovery uses (issue #13/#14/#17's "moderated URL
 * submission" idea from docs/discovery-research.md). Exists specifically
 * for sources no automated fetch/search can reach at all - e.g. a
 * hackathon only announced via a LinkedIn post, where an unauthenticated
 * fetch redirects to a login wall (verified live) rather than returning
 * any usable page content, so `extractEventEvidence` would find nothing
 * to work with even if it tried.
 *
 * Unlike a discovered candidate, there is no page to extract evidence
 * from here - the submitter (a human who already found and vetted the
 * event) types the fields directly. This still goes through the normal
 * `pending` → review → `promoteCandidate()` flow rather than writing
 * straight to `hackathons`, keeping a single, consistent audit trail for
 * every non-Provider-sourced event regardless of how it was found.
 */
export async function submitManualCandidate(
  input: ManualCandidateInput,
): Promise<SubmitManualCandidateResult> {
  const name = input.name.trim();
  const url = input.url.trim();

  if (!name) {
    return { outcome: "invalid", message: "Name is required." };
  }

  try {
    new URL(url);
  } catch {
    return { outcome: "invalid", message: "A valid URL is required." };
  }

  let country_code: string | null = null;
  if (input.countryCode) {
    country_code =
      europeanCountries.normalizeCountry(input.countryCode) ?? null;
    if (!country_code) {
      return {
        outcome: "invalid",
        message: `"${input.countryCode}" is not a recognized European country.`,
      };
    }
  }

  let date_start: string | null = null;
  if (input.dateStart) {
    const parsed = new Date(input.dateStart);
    if (Number.isNaN(parsed.getTime())) {
      return { outcome: "invalid", message: "Invalid date." };
    }
    date_start = parsed.toISOString();
  }

  const validTopics = new Set<string>(HACKATHON_TOPICS);
  const topics =
    input.topics
      ?.filter((t): t is HackathonTopic => validTopics.has(t))
      .filter((t, i, arr) => arr.indexOf(t) === i) ?? [];

  const { error } = await supabaseAdmin.from("hackathon_candidates").upsert(
    [
      // @ts-expect-error - Supabase generated types may not include insert shape
      {
        name,
        url,
        city: input.city?.trim() || null,
        country_code,
        date_start,
        query: "manual submission",
        search_provider: "manual",
        extraction_method: "text-fallback",
        raw_snippet: name,
        source: "manual",
        topics: topics.length > 0 ? topics : null,
      },
    ],
    { onConflict: "url,query", ignoreDuplicates: true },
  );

  if (error) {
    return { outcome: "error", message: error.message };
  }

  return { outcome: "created" };
}
