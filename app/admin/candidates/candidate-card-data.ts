import type { Database } from "@/types/database";
import type { HackathonCardData } from "@/components/hackathon-card";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];

/**
 * Adapter from a `hackathon_candidates` row to the shape `HackathonCard`
 * (components/hackathon-card.tsx) needs to render (issue #93). A candidate
 * row isn't shaped like a `hackathons` row - notably `date_start` is
 * nullable (a candidate can be discovered with no recoverable date) and
 * there's no `location_type`/`venue`/`is_new`/`notes` column at all - so
 * this is the smallest possible mapping rather than changing the card
 * component's props to awkwardly fit both shapes.
 *
 * `location_type` is deliberately always `"tbd"`: a web-search/manual
 * candidate has no reliable online/hybrid/physical signal (the same
 * reasoning `promote-candidate.ts` uses when it promotes a candidate to a
 * real `hackathons` row). This only affects rendering when a candidate also
 * has no city/country - in that case the card shows nothing for location,
 * same as a published event with location_type "tbd" would.
 */
export function candidateToHackathonCardData(
  candidate: CandidateRow,
): HackathonCardData {
  return {
    id: candidate.id,
    name: candidate.name,
    date_start: candidate.date_start,
    date_end: candidate.date_end,
    city: candidate.city,
    country_code: candidate.country_code,
    location_type: "tbd",
    topics: candidate.topics,
  };
}
