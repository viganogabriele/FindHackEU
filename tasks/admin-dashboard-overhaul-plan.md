# Implementation Plan: Admin dashboard overhaul

## Overview

Unify the admin candidate and published-hackathon review experience, remove the
interstitial admin landing page, add live URL-backed filtering, and fix the
dark-theme, action clarity, form autofill, date-input, and duplicate-toast UX
issues described in the request.

## Architecture decisions

- Keep the existing server-rendered data loading and use a small client search
  control with `router.replace` plus a debounce, preserving shareable URLs and
  server-side filtering.
- Reuse `HackathonCard` as the single visual card shell and expose explicit
  admin metadata/action slots rather than maintaining two independent card
  markups.
- Keep candidate and published moderation actions as separate server actions,
  but give both card types the same action-row vocabulary and layout.
- Scope admin topic badge colors to the admin card context; public topic colors
  remain unchanged.
- Preserve the existing dev-only and Google sign-in gates.

## Task list

### Phase 1: navigation, live filters, and moderation behavior

- [x] Route `/admin` directly to candidates while preserving the gate.
- [x] Move the manual trigger control into the candidates shell.
- [x] Add debounced URL-backed live search and reasons filtering.
- [x] Add rejected-candidate move-to-pending server action and UI.
- [x] Move edit-dialog result side effects into `useEffect`.

### Checkpoint: behavior

- [x] Focused admin tests pass.
- [x] TypeScript and lint pass.

### Phase 2: unified card layout and visual polish

- [x] Consolidate candidate and published cards onto the shared compact card
      layout, including an explicit "Already published" marker for published rows
      in Pending/Rejected.
- [x] Compact responsive spacing and clarify every action with icon, text, and
      tooltip where needed.
- [x] Normalize admin colors and interactive cursors.
- [x] Add anti-autofill attributes and dark date-picker indicator styling.

### Checkpoint: UI

- [x] Responsive/admin component tests pass.
- [x] Runtime browser check was not available because no browser MCP is
      configured; Webpack production build completed successfully.

### Phase 3: final verification

- [x] Format, lint, typecheck, focused Vitest tests, and Webpack production build
      pass. The requested Turbopack build was also attempted but is blocked by the
      sandbox's process/port permission error.
- [x] Worktree contains only intended changes and granular commits.

## Risks and mitigations

| Risk                                                                | Impact | Mitigation                                                                                         |
| ------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| Server-rendered filtering plus client debounce causes stale results | Medium | Keep URL as source of truth, cancel/replace pending debounce, and use the existing server queries. |
| Shared card refactor regresses public card styling                  | High   | Use the existing `HackathonCard` API and scope admin-only classes/metadata.                        |
| Candidate/published row shapes diverge                              | Medium | Keep adapters and explicit source labels while sharing the presentation shell.                     |
| Server action is callable with invalid state                        | Medium | Validate `pending` in the action/service path consistently with existing moderation actions.       |
