/** Prevent password managers from treating metadata fields as credentials. */
export const NO_AUTOFILL_PROPS = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
} as const;
