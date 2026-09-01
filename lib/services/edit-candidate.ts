import { supabaseAdmin } from "@/lib/supabase";
import { europeanCountries } from "@/lib/european-countries";
import { HACKATHON_TOPICS, type HackathonTopic } from "@/lib/constants/topics";

export interface EditCandidateInput {
  candidateId: string;
  name: string;
  city?: string;
  countryCode?: string;
  dateStart?: string;
  topics?: string[];
}

export type EditCandidateResult =
  | { outcome: "updated" }
  | { outcome: "invalid"; message: string }
  | { outcome: "error"; message: string };

/**
 * Issue #94 - lets the maintainer correct a still-pending (or rejected)
 * candidate's name/date/city/country/topics before approving it, since
 * `promoteCandidate()` (lib/services/promote-candidate.ts) copies these
 * fields as-is into the real `hackathons` table on approval: any scraped
 * error (a mis-parsed date, a missing city, wrong topics) becomes a
 * permanent error in the public listing unless caught and fixed first.
 *
 * This is a plain `UPDATE` on the still-pending `hackathon_candidates` row -
 * deliberately not the promotion flow (no `promote_hackathon_candidate` RPC,
 * no writes to `hackathons`). Because `promoteCandidate()` re-fetches the
 * candidate row fresh by id at approval time (see its own doc comment), an
 * edit applied here before clicking Approve is exactly what gets promoted -
 * there is no separate cached/stale copy of the candidate anywhere in the
 * approval path.
 *
 * `url` is deliberately NOT editable here (unlike `submitManualCandidate`,
 * which creates a brand-new row from scratch). The candidate's `url` is its
 * dedup identity - `promoteCandidate()` matches it against existing
 * `hackathons` rows via `normalizeUrl`, and `submitManualCandidate`'s own
 * upsert dedupes new candidates on `(url, query)`. Letting an edit silently
 * change that identity would risk pointing an in-review candidate at a
 * different event entirely; the issue's acceptance criteria only ask for
 * name/date/city/country/topics to be correctable, not the URL. If a
 * candidate's URL itself is wrong, deleting and re-submitting it manually
 * (`submitManualCandidate`) is the more honest fix.
 *
 * Validation mirrors `submitManualCandidate` (minus the URL check, since
 * `url` isn't part of this input at all): a recognized European country via
 * `europeanCountries.normalizeCountry()`, a parseable date, and topics
 * filtered down to the known `HACKATHON_TOPICS` set - so an edited candidate
 * can never be saved in a worse-validated state than a freshly submitted one.
 */
export async function editCandidate(
  input: EditCandidateInput,
): Promise<EditCandidateResult> {
  const name = input.name.trim();

  if (!name) {
    return { outcome: "invalid", message: "Name is required." };
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

  const { error } = await supabaseAdmin
    .from("hackathon_candidates")
    // @ts-expect-error - Supabase generated types may not include update shape
    .update({
      name,
      city: input.city?.trim() || null,
      country_code,
      date_start,
      topics: topics.length > 0 ? topics : null,
    })
    .eq("id", input.candidateId);

  if (error) {
    return { outcome: "error", message: error.message };
  }

  return { outcome: "updated" };
}
