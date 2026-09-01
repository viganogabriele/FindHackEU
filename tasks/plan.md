# Implementation Plan: PR #66 Review Corrections

## Overview

Correct the verified security, correctness, consistency, and documentation findings in the exact `feat/devfolio-provider` ref `31fed4d`. The work stays on a child branch/worktree and does not merge or copy the parallel Eventbrite work.

## Architecture Decisions

- Keep the public API's existing unbounded response shape when `limit` is omitted, while making bounded pagination strict and safe.
- Validate all web-discovery URLs before network access and manually validate redirect targets so a fetched page cannot redirect the worker into a private network.
- Keep provider parsing fault-tolerant per event/page and report known truncation as `partial`.
- Use a database RPC with row/advisory locking for candidate promotion; application-level read-then-insert cannot provide a race-free guarantee.
- Preserve the existing per-stage error handling in `app/api/update/route.ts`; do not add Eventbrite or modify its parser/test.

## Task List

### Phase 1: API and discovery safety

- [ ] Validate `status`, `limit`, and canonical two-field cursors; add route contract tests.
- [ ] Add public-URL validation, safe redirect handling, robots cache origin keys, and robots group parsing tests.
- [ ] Harden JSON-LD/OG extraction, JS detection, conflict detection, and per-result isolation tests.

### Phase 2: Provider correctness

- [ ] Fix Luma, Devfolio, MLH, and ETHGlobal partial/unknown-payload behavior with parser regressions.
- [ ] Require explicit timezone offsets in `BaseParser.formatDate` and add regression coverage.

### Checkpoint: API/discovery/provider slices

- [ ] Focused Vitest suites pass.
- [ ] TypeScript and lint remain clean.

### Phase 3: Persistence and consistency

- [ ] Add normalized URL identity plus a transactional candidate-promotion RPC, checking every database result.
- [ ] Normalize discovery known URLs, order bulk reads, and infer country from query text without dropping unknown country values.

### Phase 4: Product surface and final verification

- [ ] Render location type/venue in the listing and document the public API pagination/location contract.
- [ ] Run local Supabase verification where available, then lint, typecheck, tests, build, and knip.

## Deliberately Out of Scope

- Eventbrite (`feat/eventbrite-provider`, PR #69) and `lib/parsers/eventbrite-parser.ts`.
- Full admin authentication: the ref under review has the documented development-only gate; real Google/Supabase Auth is a separate follow-up (issue #67) and is not duplicated here.
- Wildcard/end-anchor robots semantics, named user-agent policy, headless-browser rendering, and parser deduplication refactoring: these are documented limitations/follow-ups rather than required fixes for the reported defects.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| A new SQL identity column conflicts with existing rows | High | Backfill deterministically, use a non-unique index plus transactional advisory lock, and verify on local Supabase. |
| Strict URL/date validation rejects malformed third-party data | Medium | Reject only unsafe/ambiguous values and keep per-result/per-event fallbacks. |
| Provider payload shapes change while status is corrected | Medium | Add fixtures for missing metadata, truncation, unknown values, and malformed RSC strings. |
