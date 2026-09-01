/** Stable, client-safe labels used by the pending-candidate reason filter. */
export const AUTO_PUBLISH_BLOCKER_TAGS = [
  { code: "non-web-source", label: "Non-web source" },
  { code: "unstructured-data", label: "Unstructured data" },
  { code: "conflict", label: "Conflicting data" },
  { code: "no-location", label: "No location" },
  { code: "non-european-location", label: "Non-European location" },
  { code: "no-date", label: "No date" },
] as const;

export type AutoPublishBlockerCode =
  (typeof AUTO_PUBLISH_BLOCKER_TAGS)[number]["code"];
