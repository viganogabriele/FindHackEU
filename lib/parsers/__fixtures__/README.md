# Parser fixtures

This folder holds file-based input/output fixture pairs for discovery source
parsers (see issue [#38](https://github.com/viganogabriele/HackTrack-EU/issues/38)).

Unlike the inline mocked responses in `lib/parsers/__tests__/*.test.ts` (which
exist to exercise many small, focused edge cases), a fixture pair here is
meant to be a **single, realistic, documented example** of "here is a raw
provider response, and here is exactly what it should normalize to" -- useful
as living documentation for anyone adding a new provider or auditing an
existing one, independent of any particular test.

## Convention

For each active provider `<name>`, add:

- `<name>-response-example.json` -- a realistic (hand-crafted or
  anonymized-from-real) raw API response shaped exactly like what
  `lib/parsers/<name>-parser.ts` expects to receive. Include at least one
  European city with an explicit, unambiguous location field, and prefer
  including an edge case the parser has to handle (a fallback location field,
  an item that should be filtered out, etc.).
- `<name>-expected-output.json` -- the exact `ParsedHackathon[]` the parser
  should produce from that fixture, wrapped in an object (e.g.
  `{ "hackathons": [...] }`) with dates as ISO strings (JSON has no native
  `Date` type). The consuming test re-parses these strings into `Date`s
  before comparing against the parser's real `Date` output.

Both files should carry a `_comment` field explaining any non-obvious
assumptions (what the frozen "now" is, why an item was excluded, whether the
raw fixture is hand-crafted vs. adapted from a real anonymized response).

## No personal data

Fixtures must not contain real attendee/organizer personal data. Prefer
hand-crafting a fixture from the parser's own TypeScript interfaces over
copying a live response; if you do start from a live response, strip/replace
anything that isn't necessary to exercise the parser (real names, emails,
non-essential IDs, etc.) with clearly synthetic placeholders.

## Example

See `luma-response-example.json` / `luma-expected-output.json`, consumed by
`lib/parsers/__tests__/luma-fixtures.test.ts`.
