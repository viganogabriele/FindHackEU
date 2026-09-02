import { Suspense, use, type ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  Clock3,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { CopyLinkButton } from "@/components/copy-link-button";
import { cn } from "@/lib/utils";
import { supabaseAdmin } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import {
  HackathonCard as SharedHackathonCard,
  type HackathonCardData,
} from "@/components/hackathon-card";
import type { Database } from "@/types/database";
import {
  approveCandidateAction,
  rejectCandidateAction,
  deleteCandidateAction,
} from "./actions";
import {
  deleteHackathonAction,
  archiveHackathonAction,
  unarchiveHackathonAction,
  setHackathonModerationStateAction,
} from "./hackathons/actions";
import type { ModerationState } from "@/lib/services/hackathon-moderation";
import {
  candidatesByStatusQuery,
  candidatesByStatusCountQuery,
  hackathonsByModerationStateQuery,
  hackathonsByModerationStateCountQuery,
  approvedOrPastHackathonsQuery,
  approvedOrPastHackathonsCountQuery,
  archivedHackathonsQuery,
  archivedHackathonsCountQuery,
  recentCandidateDecisionsQuery,
} from "./queries";
import {
  prescreenCandidate,
  type PrescreenExample,
  type PrescreenSuggestion,
} from "@/lib/services/llm-prescreen";
import { ManualSubmitForm } from "./manual-submit-form";
import { EditCandidateDialog } from "./edit-candidate-dialog";
import { EditHackathonDialog } from "./edit-hackathon-dialog";
import { GoogleSignInButton } from "./google-sign-in-button";
import { SignOutButton } from "./sign-out-button";
import { getAdminAuthStatus } from "@/lib/services/require-admin-auth";
import {
  getAutoPublishBlockers,
  matchesAutoPublishBlockerFilter,
  parseAutoPublishBlockerCodes,
  type AutoPublishBlockerCode,
} from "@/lib/discovery/web-search-candidates";
import { candidateToHackathonCardData } from "./candidate-card-data";
import { AdminSearchInput } from "./admin-search-input";
import { PendingReasonFilter } from "./pending-reason-filter";
import { TriggerUpdateButton } from "./trigger-update-button";
import { MoveCandidateToPendingButton } from "./move-candidate-to-pending-button";
import { AddAdminForm, RemoveAdminButton } from "./manage-admins";
import {
  listAdminUsers,
  adminUsersCountQuery,
  type AdminUserRow,
} from "@/lib/services/admin-users";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];
type HackathonRow = Database["public"]["Tables"]["hackathons"]["Row"];
type AuthStatus = Awaited<ReturnType<typeof getAdminAuthStatus>>;

// Five top-level tabs (issue #102, superseding issue #82's four-tab
// structure). Each is a genuinely distinct concept, not a UI grouping of
// convenience:
//
//   - "pending"  - not yet accepted, for whatever reason. Union of
//                  `hackathon_candidates(status='pending')` (never
//                  published) and `hackathons(moderation_state='pending')`
//                  (published, then moved back for re-review).
//   - "approved" - live/public right now, not over yet. `hackathons` rows
//                  with `moderation_state='approved'`, `archived_at is
//                  null`, and an upcoming (or future-dated "estimated")
//                  date. Never `hackathon_candidates` rows directly - a
//                  candidate becomes an "approved" row only once
//                  `promoteCandidate()` copies it into `hackathons` (see
//                  issue #82's rationale, still true here: most published
//                  rows never went through candidate review at all).
//   - "rejected" - editorial "no". Union of
//                  `hackathon_candidates(status='rejected')` (never
//                  published) and `hackathons(moderation_state='rejected')`
//                  (published, then explicitly rejected). Distinct from
//                  "archived" - see that tab's doc comment below for the
//                  issue #101->#102 correction.
//   - "past"     - the Approved-shaped counterpart for events that are
//                  over: `moderation_state='approved'`, `archived_at is
//                  null`, past (or past-dated "estimated") date. Not
//                  "no longer wanted" - still fully public, just historical.
//   - "archived" - `hackathons(archived_at is not null)` ONLY (issue #72's
//                  date-based retention tier). PR #101 originally merged
//                  this with rejected candidates into one tab; the
//                  maintainer clarified afterward (issue #102's context)
//                  that Rejected (editorial "no") and Archived (retention)
//                  are separate concepts that must be separate tabs, so
//                  this tab is un-merged back to hackathons-only here.
//
// "estimated" (`hackathons.status`) is deliberately NOT a sixth tab - see
// `approvedOrPastHackathonsQuery` in ./queries.ts for exactly how it's
// folded into Approved/Past instead, per the maintainer's explicit ask.
//
// "admins" (issue #18) is a genuinely different kind of tab from the five
// above - it manages who can access this dashboard at all, not a
// candidate/hackathon moderation state. It's included in the same
// StatusNav/STATUSES machinery purely for a consistent look (one tab bar,
// one badge-count convention), not because it's conceptually a sixth
// moderation state.
type StatusFilter =
  | "pending"
  | "approved"
  | "rejected"
  | "past"
  | "archived"
  | "admins";

const STATUSES: StatusFilter[] = [
  "pending",
  "approved",
  "rejected",
  "past",
  "archived",
  "admins",
];

type TabCounts = Record<StatusFilter, number | null>;

function sumCounts(
  results: Array<{ count: number | null; error: unknown }>,
): number | null {
  if (results.some((result) => result.error)) {
    return null;
  }

  return results.reduce((total, result) => total + (result.count ?? 0), 0);
}

async function getTabCounts(query: string): Promise<TabCounts> {
  const [
    pendingCandidates,
    pendingHackathons,
    approved,
    rejectedCandidates,
    rejectedHackathons,
    past,
    archived,
    admins,
  ] = await Promise.all([
    candidatesByStatusCountQuery(supabaseAdmin, "pending", query),
    hackathonsByModerationStateCountQuery(supabaseAdmin, "pending", query),
    approvedOrPastHackathonsCountQuery(supabaseAdmin, "approved", query),
    candidatesByStatusCountQuery(supabaseAdmin, "rejected", query),
    hackathonsByModerationStateCountQuery(supabaseAdmin, "rejected", query),
    approvedOrPastHackathonsCountQuery(supabaseAdmin, "past", query),
    archivedHackathonsCountQuery(supabaseAdmin, query),
    adminUsersCountQuery(supabaseAdmin),
  ]);

  return {
    pending: sumCounts([pendingCandidates, pendingHackathons]),
    approved: sumCounts([approved]),
    rejected: sumCounts([rejectedCandidates, rejectedHackathons]),
    past: sumCounts([past]),
    archived: sumCounts([archived]),
    // The admin count is never affected by the `query` search box (there's
    // nothing to search for on this tab), unlike every other count above.
    admins: sumCounts([admins]),
  };
}

/**
 * Review queue for web-search-discovered event candidates (issue #12,
 * #13/#14/#17 - see docs/discovery-research.md and the
 * hackathon_candidates migration), unified (issue #82, restructured by
 * issue #102) with full lifecycle management for every published
 * `hackathons` row regardless of origin.
 *
 * Issue #102's core idea: `hackathon_candidates` and `hackathons` stay two
 * separate tables (merging them was considered and explicitly rejected as
 * far riskier than necessary), but `hackathons` gained its own
 * `moderation_state` column (`'approved' | 'pending' | 'rejected'`,
 * default `'approved'`) - orthogonal to issue #72's `archived_at` - so a
 * published hackathon can move between the same three states a
 * not-yet-published candidate already could, from this same page, in
 * either direction. See the `StatusFilter` doc comment above for exactly
 * what each of the five tabs shows, and ./queries.ts for the query that
 * backs each one.
 *
 * Dev-only (`notFound()` outside development, same pattern as
 * app/api/dev/trigger-update/route.ts) AND gated behind Google sign-in via
 * Supabase Auth, restricted to a single allowlisted email
 * (`ADMIN_ALLOWED_EMAIL` - issue #67). Both gates are defense in depth: the
 * NODE_ENV check stays even though auth now exists, and the auth check is
 * also re-verified server-side inside every server action in ./actions.ts
 * and ../hackathons/actions.ts, not just here.
 */
export default async function CandidatesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    error?: string;
    reason?: string | string[];
  }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const authStatus = await getAdminAuthStatus();
  const params = await searchParams;

  if (!authStatus.authorized) {
    return (
      <SignInGate
        email={authStatus.email}
        authError={params.error === "oauth_callback_failed"}
      />
    );
  }

  const status: StatusFilter = STATUSES.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "pending";
  const query = params.q?.trim() ?? "";
  const blockerCodes = parseAutoPublishBlockerCodes(params.reason);
  const tabCounts = await getTabCounts(query);

  if (status === "approved" || status === "past") {
    return (
      <ApprovedOrPastTab
        kind={status}
        authStatus={authStatus}
        query={query}
        tabCounts={tabCounts}
      />
    );
  }

  if (status === "archived") {
    return (
      <ArchivedTab
        authStatus={authStatus}
        query={query}
        tabCounts={tabCounts}
      />
    );
  }

  if (status === "rejected") {
    return (
      <RejectedTab
        authStatus={authStatus}
        query={query}
        tabCounts={tabCounts}
      />
    );
  }

  if (status === "admins") {
    return <AdminsTab authStatus={authStatus} tabCounts={tabCounts} />;
  }

  return (
    <PendingTab
      authStatus={authStatus}
      query={query}
      blockerCodes={blockerCodes}
      tabCounts={tabCounts}
    />
  );
}

/**
 * Shared chrome (compact breadcrumb, header, sign-out, search toolbar, and
 * status navigation) for all five tabs.
 */
function AdminShell({
  authStatus,
  status,
  query,
  tabCounts,
  showManualForm = false,
  reasonCodes = [],
  children,
}: {
  authStatus: AuthStatus;
  status: StatusFilter;
  query: string;
  tabCounts: TabCounts;
  showManualForm?: boolean;
  reasonCodes?: AutoPublishBlockerCode[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
              aria-hidden="true"
            >
              A
            </span>
            <div className="hidden min-w-0 leading-tight sm:block">
              <p className="truncate text-sm font-semibold">
                Admin dashboard
              </p>
              <p className="truncate text-xs text-muted-foreground">
                FindHackEU
              </p>
            </div>
            <Separator orientation="vertical" className="hidden h-6 sm:block" />
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to site
              </Link>
            </Button>
          </div>
          <SignOutButton email={authStatus.email!} />
        </div>
      </header>

      <div className="container mx-auto max-w-5xl px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            Hackathon candidates
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Review and manage events by moderation state. Only Approved and
            Past are public.
          </p>
        </div>

        <div className="mb-6 flex flex-col gap-3 rounded-lg border bg-card/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1">
            <AdminSearchInput
              status={status}
              query={query}
              reasonCodes={reasonCodes}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TriggerUpdateButton />
            {showManualForm && <ManualSubmitForm />}
          </div>
        </div>

        <StatusNav status={status} query={query} tabCounts={tabCounts} />

        {children}
      </div>
    </div>
  );
}

/** The five-tab selector shared by every tab render branch. */
function StatusNav({
  status,
  query,
  tabCounts,
}: {
  status: StatusFilter;
  query: string;
  tabCounts: TabCounts;
}) {
  return (
    <nav
      aria-label="Moderation status"
      className="mb-6 flex flex-wrap items-center gap-1.5 border-b pb-3"
    >
      {STATUSES.map((s) => (
        <Button
          key={s}
          asChild
          variant={s === status ? "default" : "ghost"}
          size="sm"
          className="h-9 shrink-0 gap-2 px-3.5 font-medium"
        >
          <Link
            href={`/admin?status=${s}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            aria-current={s === status ? "page" : undefined}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <Badge
              variant="secondary"
              aria-label={`${tabCounts[s] ?? "Unknown"} ${s} items`}
              className={cn(
                "min-w-5 justify-center px-1.5",
                s === status && "bg-primary-foreground/20 text-primary-foreground",
              )}
            >
              {tabCounts[s] ?? "—"}
            </Badge>
          </Link>
        </Button>
      ))}
    </nav>
  );
}

/**
 * Shown instead of the review queue when there is no session, or the
 * session's email doesn't match `ADMIN_ALLOWED_EMAIL` (issue #67). This is
 * a convenience gate, not the real security boundary - see
 * app/admin/actions.ts's `assertAuthorized()`.
 */
function SignInGate({
  email,
  authError = false,
}: {
  email: string | null;
  authError?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-bold">Admin sign-in required</h1>
          <p className="text-sm text-muted-foreground">
            The candidate review queue is restricted to the project maintainer.
          </p>
          {authError && (
            <p role="alert" className="text-sm text-destructive">
              Google sign-in could not be completed. Please try again.
            </p>
          )}
          {email && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Signed in as <span className="font-medium">{email}</span>, but
              this account isn&apos;t authorized for admin access.
            </p>
          )}
          <Separator />
          <GoogleSignInButton />
          <Button asChild variant="link" size="sm">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to site
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * The Pending tab (issue #102): a union of not-yet-published candidates and
 * published hackathons the maintainer moved back for re-review. Rendered as
 * one list with a source marker on already-published rows. Both row types use
 * the same compact card component and visual hierarchy.
 */
async function PendingTab({
  authStatus,
  query,
  blockerCodes,
  tabCounts,
}: {
  authStatus: AuthStatus;
  query: string;
  blockerCodes: AutoPublishBlockerCode[];
  tabCounts: TabCounts;
}) {
  const [
    { data: candidatesData, error: candidatesError },
    { data: hackathonsData, error: hackathonsError },
  ] = await Promise.all([
    candidatesByStatusQuery(supabaseAdmin, "pending", query),
    hackathonsByModerationStateQuery(supabaseAdmin, "pending", query),
  ]);

  const candidates = candidatesData as CandidateRow[] | null;
  const hackathons = hackathonsData as HackathonRow[] | null;
  const visibleCandidates = candidates?.filter((candidate) =>
    matchesAutoPublishBlockerFilter(candidate, blockerCodes),
  );

  // Deliberately not awaited (issue: locale hydration-mismatch fix). Kicking
  // this off as a plain promise and threading it down as a prop - instead of
  // awaiting it in an async child component wrapped in <Suspense> - keeps
  // the ENTIRE candidate list (including HackathonCard's locale-dependent
  // date formatting) in the same synchronous render pass as the rest of the
  // page. Only the tiny AI-badge slot below subscribes to this promise via
  // `use()`, inside its own tight Suspense boundary - see
  // `PrescreenBadgeResolver`. `getPrescreenSuggestions` is still only called
  // once for the whole batch: every card's badge reads the same shared
  // promise instance.
  const suggestionsPromise = getPrescreenSuggestions(visibleCandidates ?? []);

  return (
    <AdminShell
      authStatus={authStatus}
      status="pending"
      query={query}
      tabCounts={tabCounts}
      showManualForm
      reasonCodes={blockerCodes}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Review queue</h2>
        <PendingReasonFilter query={query} selectedCodes={blockerCodes} />
      </div>

      {candidatesError && (
        <p className="text-sm text-destructive">
          Failed to load candidates: {candidatesError.message}
        </p>
      )}

      {!candidatesError &&
        visibleCandidates?.length === 0 &&
        hackathons?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {candidates?.length === 0
              ? `No pending candidates${query ? ` matching "${query}"` : ""}.`
              : "No pending candidates carry all selected reason tags."}
          </p>
        )}

      <ul className="space-y-2">
        {visibleCandidates?.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            status="pending"
            suggestionsPromise={suggestionsPromise}
          />
        ))}
        {hackathons?.map((hackathon) => (
          <PublishedHackathonCard
            key={hackathon.id}
            hackathon={hackathon}
            tab="pending"
          />
        ))}
      </ul>

      {hackathonsError && (
        <p className="mt-3 text-sm text-destructive">
          Failed to load already-published hackathons: {hackathonsError.message}
        </p>
      )}
    </AdminShell>
  );
}

/**
 * Best-effort LLM pre-screening (issue #17): for each pending candidate,
 * asks Gemini Flash for a suggested verdict + short rationale, shown next
 * to the Approve/Reject actions as a "suggestion only" badge - it never
 * changes `promoteCandidate()`/`rejectCandidate()` behavior.
 *
 * Skips the whole exercise (no few-shot query, no Gemini calls) when
 * `GEMINI_API_KEY` isn't configured, since `prescreenCandidate` would
 * resolve to `null` for every candidate anyway - this just avoids the
 * pointless round trip for the few-shot examples query.
 *
 * Called from `PendingTab` WITHOUT `await` and threaded down as a plain
 * promise prop (see `PrescreenBadgeResolver`'s `use()` call) instead of
 * being awaited inside an async Server Component wrapped in `<Suspense>`.
 * That prior shape put the whole `<CandidateCard>` tree - including
 * `HackathonCard`'s locale-dependent date formatting - inside a
 * Suspense-streamed subtree, which could resolve/reconcile on the client
 * after the initial hydration pass had already picked up a rehydrated
 * locale from `localStorage` (see `lib/locale-store.ts`), producing a
 * server/client text mismatch. Scoping the Suspense boundary down to just
 * the tiny AI-badge slot means only that one small subtree can ever
 * resolve out-of-band; everything else renders synchronously in the single
 * initial pass and can never hydrate against a different locale.
 *
 * This function itself must never reject - `use()` on a rejected promise
 * throws to the nearest error boundary, which would take down the whole
 * Pending tab rather than just one badge - so the entire body is wrapped
 * in a top-level try/catch that resolves to an empty `Map` on any failure
 * (a Supabase network error on the few-shot query, for instance). Every
 * per-candidate `prescreenCandidate` call already degrades to `null` on
 * its own (missing key, network error, timeout, malformed response - see
 * lib/services/llm-prescreen.ts), so the `Promise.all` below can't reject
 * either; the outer try/catch is defense in depth for the examples query.
 *
 * v1 caches nothing across page loads - a re-render re-calls Gemini for
 * every visible pending candidate. That's an accepted tradeoff for this
 * size of a queue (a handful of candidates/day, comfortably within a free
 * tier - see CLAUDE.md's issue #17 write-up); revisit only if the queue or
 * page-view volume grows enough to matter.
 */
async function getPrescreenSuggestions(
  candidates: CandidateRow[],
): Promise<Map<string, PrescreenSuggestion>> {
  const suggestions = new Map<string, PrescreenSuggestion>();

  if (!process.env.GEMINI_API_KEY || candidates.length === 0) {
    return suggestions;
  }

  try {
    const { data: examplesData } =
      await recentCandidateDecisionsQuery(supabaseAdmin);
    const examples: PrescreenExample[] = (examplesData ??
      []) as PrescreenExample[];

    const results = await Promise.all(
      candidates.map(async (candidate) => {
        const suggestion = await prescreenCandidate(
          {
            name: candidate.name,
            raw_snippet: candidate.raw_snippet,
            extraction_method: candidate.extraction_method,
            query: candidate.query,
            has_conflict: candidate.has_conflict,
            blockers: getAutoPublishBlockers(candidate),
          },
          examples,
        );
        return [candidate.id, suggestion] as const;
      }),
    );

    for (const [id, suggestion] of results) {
      if (suggestion) {
        suggestions.set(id, suggestion);
      }
    }
  } catch (error) {
    console.warn(
      `LLM pre-screening batch failed, continuing with no AI suggestions: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  return suggestions;
}

/**
 * The Rejected tab (issue #102): a union of never-published rejected
 * candidates and published hackathons the maintainer explicitly rejected
 * post-publication. This is the tab that used to be merged with Archived
 * (PR #101) - see the module doc comment's "archived" bullet for why that
 * was corrected here. Published rows are kept in the same list and carry an
 * explicit source marker.
 */
async function RejectedTab({
  authStatus,
  query,
  tabCounts,
}: {
  authStatus: AuthStatus;
  query: string;
  tabCounts: TabCounts;
}) {
  const [
    { data: candidatesData, error: candidatesError },
    { data: hackathonsData, error: hackathonsError },
  ] = await Promise.all([
    candidatesByStatusQuery(supabaseAdmin, "rejected", query),
    hackathonsByModerationStateQuery(supabaseAdmin, "rejected", query),
  ]);

  const candidates = candidatesData as CandidateRow[] | null;
  const hackathons = hackathonsData as HackathonRow[] | null;

  return (
    <AdminShell
      authStatus={authStatus}
      status="rejected"
      query={query}
      tabCounts={tabCounts}
    >
      <h2 className="mb-3 text-lg font-semibold">Review queue</h2>

      {candidatesError && (
        <p className="text-sm text-destructive">
          Failed to load candidates: {candidatesError.message}
        </p>
      )}

      {!candidatesError &&
        candidates?.length === 0 &&
        hackathons?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No rejected candidates{query ? ` matching "${query}"` : ""}.
          </p>
        )}

      <ul className="space-y-2">
        {candidates?.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            status="rejected"
          />
        ))}
        {hackathons?.map((hackathon) => (
          <PublishedHackathonCard
            key={hackathon.id}
            hackathon={hackathon}
            tab="rejected"
          />
        ))}
      </ul>

      {hackathonsError && (
        <p className="mt-3 text-sm text-destructive">
          Failed to load already-published hackathons: {hackathonsError.message}
        </p>
      )}
    </AdminShell>
  );
}

/**
 * Approved and Past (issue #102) share this one render function - both are
 * `hackathons`-only, `moderation_state='approved'`, `archived_at is null`,
 * differing only in the date-derived kind (see
 * `approvedOrPastHackathonsQuery` in ./queries.ts for exactly how
 * `status = 'estimated'` rows are folded into one or the other rather than
 * being their own category).
 */
async function ApprovedOrPastTab({
  kind,
  authStatus,
  query,
  tabCounts,
}: {
  kind: "approved" | "past";
  authStatus: AuthStatus;
  query: string;
  tabCounts: TabCounts;
}) {
  const { data, error } = await approvedOrPastHackathonsQuery(
    supabaseAdmin,
    kind,
    query,
  );

  const hackathons = data as HackathonRow[] | null;

  return (
    <AdminShell
      authStatus={authStatus}
      status={kind}
      query={query}
      tabCounts={tabCounts}
    >
      {error && (
        <p className="text-sm text-destructive">
          Failed to load hackathons: {error.message}
        </p>
      )}

      {!error && hackathons?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No {kind} hackathons{query ? ` matching "${query}"` : ""}.
        </p>
      )}

      <ul className="space-y-2">
        {hackathons?.map((hackathon) => (
          <PublishedHackathonCard
            key={hackathon.id}
            hackathon={hackathon}
            tab={kind}
          />
        ))}
      </ul>
    </AdminShell>
  );
}

/**
 * The Archived tab (issue #72, corrected by issue #102): `hackathons` rows
 * with `archived_at is not null`, ONLY - no longer merged with rejected
 * candidates (that was PR #101's original design; the maintainer clarified
 * afterward that Rejected and Archived are separate concepts - see the
 * module doc comment's "archived" bullet and ./queries.ts's
 * `archivedHackathonsQuery` doc comment for the full correction). Unarchive
 * restores it to whichever `moderation_state` it already had (almost always
 * still "approved" - archiving doesn't touch moderation state at all).
 */
async function ArchivedTab({
  authStatus,
  query,
  tabCounts,
}: {
  authStatus: AuthStatus;
  query: string;
  tabCounts: TabCounts;
}) {
  const { data, error } = await archivedHackathonsQuery(supabaseAdmin, query);
  const hackathons = data as HackathonRow[] | null;

  return (
    <AdminShell
      authStatus={authStatus}
      status="archived"
      query={query}
      tabCounts={tabCounts}
    >
      {error && (
        <p className="text-sm text-destructive">
          Failed to load archived hackathons: {error.message}
        </p>
      )}

      {!error && hackathons?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No archived hackathons{query ? ` matching "${query}"` : ""}.
        </p>
      )}

      <ul className="space-y-2">
        {hackathons?.map((hackathon) => (
          <PublishedHackathonCard
            key={hackathon.id}
            hackathon={hackathon}
            tab="archived"
          />
        ))}
      </ul>
    </AdminShell>
  );
}

/**
 * The Admins tab (issue #18) - lets an authorized admin see and manage who
 * else can access this dashboard, without touching env vars or the
 * database directly. Reachable only by someone who already passed the
 * `getAdminAuthStatus()` check at the top of the page component above -
 * same defense-in-depth as every other tab (real security is
 * `requireAdminAuth()`, re-checked inside every server action this tab
 * calls, not this page-level gate).
 *
 * The `ADMIN_ALLOWED_EMAIL` fallback account (if configured) is shown as
 * its own read-only row, separate from the real `admin_users` rows below
 * it - it's not a row in the table at all (see require-admin-auth.ts's
 * fallback check), so it has no `added_at`/`added_by` and can't be removed
 * from here; removing it would require unsetting the env var and
 * redeploying, which is the point (a guaranteed way in that this UI can't
 * accidentally take away).
 */
async function AdminsTab({
  authStatus,
  tabCounts,
}: {
  authStatus: AuthStatus;
  tabCounts: TabCounts;
}) {
  const { data, error } = await listAdminUsers(supabaseAdmin);
  const admins = data as AdminUserRow[] | null;
  const fallbackEmail = process.env.ADMIN_ALLOWED_EMAIL ?? null;

  return (
    <AdminShell
      authStatus={authStatus}
      status="admins"
      query=""
      tabCounts={tabCounts}
    >
      <div className="mb-5 flex items-start gap-2.5">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Manage admins</h2>
          <p className="text-sm text-muted-foreground">
            Anyone listed below can sign in with their own Google account and
            get full access to this dashboard. Removing someone here takes
            effect on their next sign-in check.
          </p>
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-3 pt-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Add a new admin
          </div>
          <AddAdminForm />
        </CardContent>
      </Card>

      {fallbackEmail && (
        <Card className="mb-3">
          <CardContent className="flex flex-wrap items-start justify-between gap-3 py-3 sm:flex-nowrap sm:items-center">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
                aria-hidden="true"
              >
                {fallbackEmail.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-medium"
                  title={fallbackEmail}
                >
                  {fallbackEmail}
                </p>
                <p className="text-xs text-muted-foreground">
                  Fallback admin (ADMIN_ALLOWED_EMAIL) - always allowed, can
                  only be changed via the deployment&apos;s environment
                  variables.
                </p>
              </div>
            </div>
            <Badge variant="secondary" className="shrink-0">
              Fallback
            </Badge>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-destructive">
          Failed to load admins: {error.message}
        </p>
      )}

      {!error && admins?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No admins in the table yet
          {fallbackEmail
            ? " - the fallback account above still has access."
            : "."}
        </p>
      )}

      <ul className="space-y-2">
        {admins?.map((admin) => {
          const isSelf =
            authStatus.email?.toLowerCase() === admin.email.toLowerCase();
          return (
            <li key={admin.email}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
                      aria-hidden="true"
                    >
                      {admin.email.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p
                        className="truncate text-sm font-medium"
                        title={admin.email}
                      >
                        {admin.email}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (you)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(admin.added_at).toLocaleDateString()}
                        {admin.added_by ? ` by ${admin.added_by}` : ""}
                      </p>
                    </div>
                  </div>
                  <RemoveAdminButton email={admin.email} isSelf={isSelf} />
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </AdminShell>
  );
}

/**
 * Pending/Rejected candidate card (issue #93). Renders the candidate as a
 * real hackathon card - same date/location/topics presentation the public
 * site uses once the event is published - via the shared `HackathonCard`
 * (components/hackathon-card.tsx), mapped through
 * `candidateToHackathonCardData` since a `hackathon_candidates` row isn't
 * shaped like a `hackathons` row. The admin-only "how it was found" context
 * (source, search provider, query, and compact reason tags) is folded into
 * one inline metadata row inside the same card, so each candidate takes one
 * compact vertical slot.
 *
 * The footer is an admin action bar (Approve, Edit, Reject, Delete)
 * instead of the public site's Share/Calendar buttons, passed in via
 * `HackathonCard`'s `actions` slot. Edit (issue #94) opens
 * `EditCandidateDialog`, letting a wrong/incomplete scraped field
 * (mis-parsed date, missing city, wrong topics) be corrected before
 * Approve copies it into the real `hackathons` table.
 *
 * Only ever rendered for `status: "pending" | "rejected"` (issue #102 - the
 * candidate-review lifecycle never reaches "approved"/"past"/"archived",
 * those are hackathons-only concepts once a candidate is promoted).
 */
function CandidateCard({
  candidate,
  status,
  suggestionsPromise,
}: {
  candidate: CandidateRow;
  status: "pending" | "rejected";
  suggestionsPromise?: Promise<Map<string, PrescreenSuggestion>>;
}) {
  return (
    <li>
      <SharedHackathonCard
        hackathon={candidateToHackathonCardData(candidate)}
        compact
        adminTheme
        titleLink
        meta={
          <CandidateContext
            candidate={candidate}
            status={status}
            suggestionsPromise={suggestionsPromise}
          />
        }
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
            <CopyLinkButton url={candidate.url} />
            <form action={approveCandidateAction.bind(null, candidate.id)}>
              <Button
                type="submit"
                variant="success"
                size="icon"
                title={status === "rejected" ? "Approve anyway" : "Approve"}
                aria-label={
                  status === "rejected" ? "Approve anyway" : "Approve"
                }
              >
                <Check aria-hidden="true" />
              </Button>
            </form>
            <MoveCandidateToPendingButton
              candidateId={candidate.id}
              disabled={status !== "rejected"}
              disabledReason={
                status !== "rejected" ? "Already pending" : undefined
              }
            />
            <EditCandidateDialog candidate={candidate} />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Only published hackathons can be archived"
              aria-label="Only published hackathons can be archived"
              disabled
            >
              <Archive aria-hidden="true" />
            </Button>
            <form
              action={rejectCandidateAction.bind(null, candidate.id, undefined)}
            >
              <Button
                type="submit"
                variant="destructive"
                size="icon"
                title={status === "rejected" ? "Already rejected" : "Reject"}
                aria-label={
                  status === "rejected" ? "Already rejected" : "Reject"
                }
                disabled={status === "rejected"}
              >
                <X aria-hidden="true" />
              </Button>
            </form>
            <form action={deleteCandidateAction.bind(null, candidate.id)}>
              <ConfirmDeleteButton
                confirmMessage={`Permanently delete "${candidate.name}"? This cannot be undone.`}
              />
            </form>
          </div>
        }
      />
    </li>
  );
}

function CandidateContext({
  candidate,
  status,
  suggestionsPromise,
}: {
  candidate: CandidateRow;
  status: "pending" | "rejected";
  suggestionsPromise?: Promise<Map<string, PrescreenSuggestion>>;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
      aria-label="Candidate source details"
    >
      {status === "pending" && suggestionsPromise && (
        <Suspense fallback={null}>
          <PrescreenBadgeResolver
            candidateId={candidate.id}
            suggestionsPromise={suggestionsPromise}
          />
        </Suspense>
      )}
      <span title={`Source: ${candidate.source}`}>
        Source: {candidate.source}
      </span>
      <span title={`Search provider: ${candidate.search_provider}`}>
        via {candidate.search_provider}
      </span>
      <span
        className="max-w-full truncate"
        title={`Search query: ${candidate.query}`}
      >
        Query: {candidate.query}
      </span>

      {status === "rejected" && (
        <>
          <Badge
            variant={
              candidate.extraction_method === "jsonld-event"
                ? "default"
                : candidate.extraction_method === "og-meta"
                  ? "secondary"
                  : "outline"
            }
            className="h-5 px-1.5 text-[11px]"
          >
            {candidate.extraction_method}
          </Badge>
          {candidate.has_conflict && (
            <Badge variant="destructive" className="h-5 px-1.5 text-[11px]">
              Conflicting page data
            </Badge>
          )}
        </>
      )}

      {status === "pending" && <AutoPublishBlockers candidate={candidate} />}
    </div>
  );
}

/**
 * Reads the shared `suggestionsPromise` via React's `use()` hook and renders
 * this one candidate's badge, if any. This is the ONLY thing inside the tight
 * `<Suspense fallback={null}>` boundary in `CandidateContext` - deliberately
 * not the whole card - so a slow/pending Gemini batch can only ever delay
 * this small badge-sized subtree, never the candidate's name/date/location,
 * which render synchronously in the same pass as the rest of the page (see
 * `getPrescreenSuggestions`'s doc comment for the full hydration-mismatch
 * rationale). Every candidate's resolver reads the SAME promise instance, so
 * `getPrescreenSuggestions` is still only invoked once per batch.
 */
function PrescreenBadgeResolver({
  candidateId,
  suggestionsPromise,
}: {
  candidateId: string;
  suggestionsPromise: Promise<Map<string, PrescreenSuggestion>>;
}) {
  const suggestions = use(suggestionsPromise);
  const suggestion = suggestions.get(candidateId) ?? null;
  return suggestion ? <PrescreenBadge suggestion={suggestion} /> : null;
}

/**
 * Renders the LLM pre-screening suggestion (issue #17) as a small,
 * moderation-aid-only badge - never a primary action, never anything that
 * changes what Approve/Reject do. `verdict` picks the badge tone;
 * `rationale` is the short one/two-sentence explanation, shown as both
 * inline text (truncated) and a full-text `title` tooltip.
 */
function PrescreenBadge({ suggestion }: { suggestion: PrescreenSuggestion }) {
  const variant =
    suggestion.verdict === "likely-valid"
      ? "default"
      : suggestion.verdict === "caution"
        ? "destructive"
        : "outline";

  const label =
    suggestion.verdict === "likely-valid"
      ? "AI: likely valid"
      : suggestion.verdict === "caution"
        ? "AI: caution"
        : "AI: unclear";

  return (
    <Badge
      variant={variant}
      title={`AI suggestion (not a decision): ${suggestion.rationale}`}
      className="h-5 max-w-[280px] truncate px-1.5 text-[11px]"
    >
      {label} — {suggestion.rationale}
    </Badge>
  );
}

/**
 * Surfaces exactly why a pending candidate wasn't auto-published (issue
 * #78/#104), by calling `getAutoPublishBlockers` - the same function
 * `isAutoPublishEligible` is defined in terms of, so this can never
 * silently drift from the real auto-publish decision. Purely informational:
 * doesn't change the approve/reject flow below it.
 */
function AutoPublishBlockers({ candidate }: { candidate: CandidateRow }) {
  const blockers = getAutoPublishBlockers(candidate);

  if (blockers.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Auto-publish blockers">
      {blockers.map((blocker) => (
        <Badge
          key={blocker.code}
          variant="outline"
          title={blocker.label}
          className="h-5 px-1.5 text-[11px]"
        >
          {blocker.label}
        </Badge>
      ))}
    </div>
  );
}

type PublishedHackathonTab =
  | "pending"
  | "approved"
  | "rejected"
  | "past"
  | "archived";

/**
 * A published `hackathons` row, shown on every tab except the two
 * candidate-only sections - Approved/Past (issue #82's "Approved should
 * show every published hackathon, not just candidate-promoted ones",
 * extended by issue #102's Past split), Pending/Rejected's
 * "From published hackathons" section (issue #102's new moderation
 * lifecycle for already-published rows), and Archived (issue #72).
 *
 * `tab` drives which action buttons render. Every row follows the same
 * severity order: safe moderation action, Edit, reversible archive action,
 * then destructive Reject/Delete actions. Archived rows start with Unarchive.
 *
 * Archive/Unarchive and hard Delete are unchanged from PR #101/#82 - see
 * their own action doc comments in ../hackathons/actions.ts for the
 * reversible-vs-irreversible-removal rationale, which issue #102 doesn't
 * touch.
 */
function PublishedHackathonCard({
  hackathon,
  tab,
}: {
  hackathon: HackathonRow;
  tab: PublishedHackathonTab;
}) {
  return (
    <li>
      <SharedHackathonCard
        hackathon={hackathonToHackathonCardData(hackathon)}
        compact
        adminTheme
        titleLink
        meta={<PublishedContext hackathon={hackathon} tab={tab} />}
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
            <CopyLinkButton url={hackathon.url} />
            <HackathonModerationAction
              hackathon={hackathon}
              label="Approve"
              state="approved"
              icon={Check}
              disabled={
                tab === "approved" || tab === "past" || tab === "archived"
              }
              disabledReason={
                tab === "approved" || tab === "past"
                  ? "Already approved"
                  : tab === "archived"
                    ? "Archived hackathons cannot be moderated"
                    : undefined
              }
            />
            <HackathonModerationAction
              hackathon={hackathon}
              label="Move to pending"
              state="pending"
              icon={Clock3}
              disabled={tab === "pending" || tab === "archived"}
              disabledReason={
                tab === "pending"
                  ? "Already pending"
                  : tab === "archived"
                    ? "Archived hackathons cannot be moderated"
                    : undefined
              }
            />
            <EditHackathonDialog hackathon={hackathon} />
            {tab === "archived" ? (
              <form action={unarchiveHackathonAction.bind(null, hackathon.id)}>
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  aria-label="Unarchive"
                  title="Unarchive (restore to the public listing)"
                >
                  <ArchiveRestore aria-hidden="true" />
                </Button>
              </form>
            ) : (
              <form
                action={archiveHackathonAction.bind(
                  null,
                  hackathon.id,
                  undefined,
                )}
              >
                <Button
                  type="submit"
                  variant="outline"
                  size="icon"
                  aria-label="Archive"
                  title={
                    hackathon.moderation_state === "approved"
                      ? "Archive (remove from the public listing, reversible)"
                      : "Approve or reject this hackathon before archiving it"
                  }
                  disabled={hackathon.moderation_state !== "approved"}
                >
                  <Archive aria-hidden="true" />
                </Button>
              </form>
            )}
            <HackathonModerationAction
              hackathon={hackathon}
              label="Reject"
              state="rejected"
              icon={X}
              disabled={tab === "rejected" || tab === "archived"}
              disabledReason={
                tab === "rejected"
                  ? "Already rejected"
                  : tab === "archived"
                    ? "Archived hackathons cannot be moderated"
                    : undefined
              }
            />
            <form action={deleteHackathonAction.bind(null, hackathon.id)}>
              <ConfirmDeleteButton
                confirmMessage={`Permanently delete "${hackathon.name}" from the live site? This cannot be undone.`}
              />
            </form>
          </div>
        }
      />
    </li>
  );
}

function hackathonToHackathonCardData(
  hackathon: HackathonRow,
): HackathonCardData {
  return {
    id: hackathon.id,
    name: hackathon.name,
    url: hackathon.url,
    date_start: hackathon.date_start,
    date_end: hackathon.date_end,
    city: hackathon.city,
    country_code: hackathon.country_code,
    location_type: hackathon.location_type,
    topics: hackathon.topics,
    notes: hackathon.notes,
    is_new: hackathon.is_new,
    preview_image_url: hackathon.preview_image_url,
  };
}

function PublishedContext({
  hackathon,
  tab,
}: {
  hackathon: HackathonRow;
  tab: PublishedHackathonTab;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>Source: {hackathon.source}</span>
      {tab === "pending" || tab === "rejected" ? (
        <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
          Already published
        </Badge>
      ) : null}
      {hackathon.status === "estimated" && (
        <Badge
          variant="outline"
          className="h-5 px-1.5 text-[11px]"
          title="No structured date was recoverable when this was approved - date_start is a placeholder used only to sort it into Approved/Past."
        >
          Date estimated
        </Badge>
      )}
      {tab === "archived" && hackathon.archived_at && (
        <span>
          Archived {new Date(hackathon.archived_at).toLocaleDateString()}
          {hackathon.archived_reason ? ` - ${hackathon.archived_reason}` : ""}
        </span>
      )}
    </div>
  );
}

function HackathonModerationAction({
  hackathon,
  label,
  state,
  icon: Icon,
  disabled = false,
  disabledReason,
}: {
  hackathon: HackathonRow;
  label: string;
  state: ModerationState;
  icon: typeof Check;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <form
      action={setHackathonModerationStateAction.bind(null, hackathon.id, state)}
    >
      <Button
        type="submit"
        variant={
          state === "rejected"
            ? "destructive"
            : state === "approved"
              ? "success"
              : "outline"
        }
        size="icon"
        title={disabledReason ?? label}
        aria-label={disabledReason ?? label}
        disabled={disabled}
      >
        <Icon aria-hidden="true" />
      </Button>
    </form>
  );
}
