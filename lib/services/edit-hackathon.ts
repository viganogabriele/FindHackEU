import { supabaseAdmin } from "@/lib/supabase";
import { europeanCountries } from "@/lib/european-countries";
import { HACKATHON_TOPICS, type HackathonTopic } from "@/lib/constants/topics";
import { assertPublicHttpUrl } from "@/lib/http/fetch-public-url";

export interface EditHackathonInput {
  hackathonId: string;
  url: string;
  name: string;
  city?: string;
  countryCode?: string;
  dateStart?: string;
  topics?: string[];
}

export type EditHackathonResult =
  | { outcome: "updated" }
  | { outcome: "invalid"; message: string }
  | { outcome: "error"; message: string };

/**
 * Issue #103 - lets the maintainer correct an already-published hackathon's
 * URL, name/date/location, and topics in place. This deliberately targets the
 * `hackathons` row directly rather than going through candidate promotion:
 * published rows can have come from the main provider pipeline and have no
 * `hackathon_candidates` row at all.
 *
 * Unlike issue #94's candidate editor, the URL is editable here. Once a row is
 * published there is no candidate promotion re-match to protect, and a
 * maintainer may need to move an event to its corrected source page. It still
 * must be a public absolute HTTP(S) URL, so an edit cannot introduce a local,
 * private, or non-web destination into data that other server processes may
 * later handle.
 *
 * Validation mirrors the candidate editor: countries are normalized through
 * `europeanCountries.normalizeCountry()`, dates are converted to ISO strings,
 * and unknown topics are discarded. Unlike a candidate's nullable
 * `date_start`, a published hackathon's `date_start` is required by the
 * database schema, so an empty date is rejected.
 */
export async function editHackathon(
  input: EditHackathonInput,
): Promise<EditHackathonResult> {
  const name = input.name.trim();
  const url = input.url.trim();

  if (!name) {
    return { outcome: "invalid", message: "Name is required." };
  }

  try {
    assertPublicHttpUrl(url);
  } catch {
    return {
      outcome: "invalid",
      message: "A public HTTP(S) URL is required.",
    };
  }

  let country_code: string | null = null;
  const countryInput = input.countryCode?.trim() ?? "";
  if (countryInput) {
    country_code = europeanCountries.normalizeCountry(countryInput) ?? null;
    if (!country_code) {
      return {
        outcome: "invalid",
        message: `"${countryInput}" is not a recognized European country.`,
      };
    }
  }

  const dateInput = input.dateStart?.trim() ?? "";
  if (!dateInput) {
    return { outcome: "invalid", message: "Start date is required." };
  }

  const parsedDate = new Date(dateInput);
  if (Number.isNaN(parsedDate.getTime())) {
    return { outcome: "invalid", message: "Invalid date." };
  }
  const date_start = parsedDate.toISOString();

  const validTopics = new Set<string>(HACKATHON_TOPICS);
  const topics =
    input.topics
      ?.filter((topic): topic is HackathonTopic => validTopics.has(topic))
      .filter((topic, index, all) => all.indexOf(topic) === index) ?? [];

  const { error } = await supabaseAdmin
    .from("hackathons")
    // @ts-expect-error - Supabase generated types may not include update shape
    .update({
      name,
      url,
      city: input.city?.trim() || null,
      country_code,
      date_start,
      topics: topics.length > 0 ? topics : null,
    })
    .eq("id", input.hackathonId);

  if (error) {
    return { outcome: "error", message: error.message };
  }

  return { outcome: "updated" };
}
