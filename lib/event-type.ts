/**
 * Public-facing event categories inferred from the event title.
 *
 * This deliberately lives at the presentation boundary instead of being a
 * persisted scraper claim: the current rows predate the taxonomy and not all
 * providers expose a reliable structured type. Keeping it deterministic lets
 * old and newly discovered events behave identically, and makes every result
 * reclassifiable when the vocabulary improves.
 */
export type EventType = "hackathon" | "challenge" | "competition" | "other";

export const EVENT_TYPES: readonly EventType[] = [
  "hackathon",
  "challenge",
  "competition",
  "other",
];

function normalizeTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const HACKATHON_PATTERN =
  /\b(hackathons?|hackatons?|hack[\s-]*days?|make[\s-]*a[\s-]*thons?|build[\s-]*a[\s-]*thons?|buildathons?|codefests?|maratona\s+di\s+programmazione|marathon\s+de\s+(programmation|codage)|programmier(marathon|wettbewerb))\b/;
const CHALLENGE_PATTERN =
  /\b(challenges?|sfida|sfide|defis?|herausforderung(?:en)?)\b/;
const COMPETITION_PATTERN =
  /\b(competitions?|competizione|competizioni|concorso|concorsi|concours|wettbewerbs?|contests?)\b/;

/**
 * Classify the event form named in a title. "Hackathon" wins when multiple
 * labels are present: "Hackathon Challenge" normally describes the format,
 * not a separate generic challenge.
 */
export function getEventType(title: string): EventType {
  const normalizedTitle = normalizeTitle(title);
  if (HACKATHON_PATTERN.test(normalizedTitle)) return "hackathon";
  if (CHALLENGE_PATTERN.test(normalizedTitle)) return "challenge";
  if (COMPETITION_PATTERN.test(normalizedTitle)) return "competition";
  return "other";
}
