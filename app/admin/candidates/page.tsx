import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  Clock3,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { HackathonCard as SharedHackathonCard } from "@/components/hackathon-card";
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
} from "../hackathons/actions";
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
} from "./queries";
import { ManualSubmitForm } from "./manual-submit-form";
import { EditCandidateDialog } from "./edit-candidate-dialog";
import { EditHackathonDialog } from "./edit-hackathon-dialog";
import { GoogleSignInButton } from "./google-sign-in-button";
import { SignOutButton } from "./sign-out-button";
import { getAdminAuthStatus } from "@/lib/services/require-admin-auth";
import {
  AUTO_PUBLISH_BLOCKER_TAGS,
  getAutoPublishBlockers,
  matchesAutoPublishBlockerFilter,
  parseAutoPublishBlockerCodes,
  type AutoPublishBlockerCode,
} from "@/lib/discovery/web-search-candidates";
import { candidateToHackathonCardData } from "./candidate-card-data";

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
type StatusFilter = "pending" | "approved" | "rejected" | "past" | "archived";

const STATUSES: StatusFilter[] = [
  "pending",
  "approved",
  "rejected",
  "past",
  "archived",
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
  ] = await Promise.all([
    candidatesByStatusCountQuery(supabaseAdmin, "pending", query),
    hackathonsByModerationStateCountQuery(supabaseAdmin, "pending", query),
    approvedOrPastHackathonsCountQuery(supabaseAdmin, "approved", query),
    candidatesByStatusCountQuery(supabaseAdmin, "rejected", query),
    hackathonsByModerationStateCountQuery(supabaseAdmin, "rejected", query),
    approvedOrPastHackathonsCountQuery(supabaseAdmin, "past", query),
    archivedHackathonsCountQuery(supabaseAdmin, query),
  ]);

  return {
    pending: sumCounts([pendingCandidates, pendingHackathons]),
    approved: sumCounts([approved]),
    rejected: sumCounts([rejectedCandidates, rejectedHackathons]),
    past: sumCounts([past]),
    archived: sumCounts([archived]),
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
  children,
}: {
  authStatus: AuthStatus;
  status: StatusFilter;
  query: string;
  tabCounts: TabCounts;
  showManualForm?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <header className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/admin"
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Dashboard
            </Link>
            <h1 className="text-xl font-bold tracking-tight">
              Hackathon candidates
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Review and manage events by moderation state. Only Approved and
              Past are public.
            </p>
          </div>
          <SignOutButton email={authStatus.email!} />
        </header>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <form className="flex min-w-0 flex-1 gap-2" method="get">
            <input type="hidden" name="status" value={status} />
            <Input
              type="search"
              name="q"
              placeholder="Search name, city, country, or query…"
              defaultValue={query}
              className="h-8 min-w-0 flex-1 sm:max-w-sm"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>
          {showManualForm && <ManualSubmitForm />}
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
      className="mb-5 flex gap-1 overflow-x-auto border-b pb-2"
    >
      {STATUSES.map((s) => (
        <Button
          key={s}
          asChild
          variant={s === status ? "default" : "ghost"}
          size="sm"
          className="shrink-0 px-2.5"
        >
          <Link
            href={`/admin/candidates?status=${s}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
            aria-current={s === status ? "page" : undefined}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <Badge
              variant={s === status ? "secondary" : "outline"}
              aria-label={`${tabCounts[s] ?? "Unknown"} ${s} items`}
              className="min-w-5 justify-center px-1.5"
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
 * app/admin/candidates/actions.ts's `assertAuthorized()`.
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
 * two clearly-labeled sections rather than one interleaved list - same
 * pattern PR #101's ArchivedTab established for its own two-source union -
 * since the two row shapes need genuinely different cards (`CandidateCard`
 * vs `PublishedHackathonCard`) and action sets.
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

  return (
    <AdminShell
      authStatus={authStatus}
      status="pending"
      query={query}
      tabCounts={tabCounts}
      showManualForm
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Candidates</h2>
        <PendingReasonFilter query={query} selectedCodes={blockerCodes} />
      </div>

      {candidatesError && (
        <p className="text-sm text-destructive">
          Failed to load candidates: {candidatesError.message}
        </p>
      )}

      {!candidatesError && visibleCandidates?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {candidates?.length === 0
            ? `No pending candidates${query ? ` matching "${query}"` : ""}.`
            : "No pending candidates carry all selected reason tags."}
        </p>
      )}

      <ul className="mb-6 space-y-3">
        {visibleCandidates?.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            status="pending"
          />
        ))}
      </ul>

      <Separator className="mb-6" />

      <h2 className="mb-3 text-lg font-semibold">Published hackathons</h2>

      {hackathonsError && (
        <p className="text-sm text-destructive">
          Failed to load hackathons: {hackathonsError.message}
        </p>
      )}

      {!hackathonsError && hackathons?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No pending hackathons{query ? ` matching "${query}"` : ""}.
        </p>
      )}

      <ul className="space-y-3">
        {hackathons?.map((hackathon) => (
          <PublishedHackathonCard
            key={hackathon.id}
            hackathon={hackathon}
            tab="pending"
          />
        ))}
      </ul>
    </AdminShell>
  );
}

function PendingReasonFilter({
  query,
  selectedCodes,
}: {
  query: string;
  selectedCodes: AutoPublishBlockerCode[];
}) {
  const clearHref = `/admin/candidates?status=pending${query ? `&q=${encodeURIComponent(query)}` : ""}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={selectedCodes.length > 0 ? "secondary" : "outline"}
          size="sm"
          aria-label="Filter pending candidates by reason"
        >
          <SlidersHorizontal aria-hidden="true" />
          Reasons
          {selectedCodes.length > 0 && (
            <Badge variant="outline" className="min-w-5 justify-center px-1">
              {selectedCodes.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] p-3"
      >
        <form method="get" aria-label="Filter pending candidates">
          <input type="hidden" name="status" value="pending" />
          {query && <input type="hidden" name="q" value={query} />}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Filter by pending reason
            </legend>
            <div className="grid gap-1">
              {AUTO_PUBLISH_BLOCKER_TAGS.map((tag) => (
                <label
                  key={tag.code}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <input
                    type="checkbox"
                    name="reason"
                    value={tag.code}
                    defaultChecked={selectedCodes.includes(tag.code)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <Badge
                    variant={
                      selectedCodes.includes(tag.code) ? "default" : "outline"
                    }
                  >
                    {tag.label}
                  </Badge>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-3 flex items-center gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            {selectedCodes.length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link href={clearHref}>Clear</Link>
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The Rejected tab (issue #102): a union of never-published rejected
 * candidates and published hackathons the maintainer explicitly rejected
 * post-publication. This is the tab that used to be merged with Archived
 * (PR #101) - see the module doc comment's "archived" bullet for why that
 * was corrected here. Same two-section layout as PendingTab.
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
      <h2 className="mb-3 text-lg font-semibold">Candidates</h2>

      {candidatesError && (
        <p className="text-sm text-destructive">
          Failed to load candidates: {candidatesError.message}
        </p>
      )}

      {!candidatesError && candidates?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No rejected candidates{query ? ` matching "${query}"` : ""}.
        </p>
      )}

      <ul className="mb-6 space-y-3">
        {candidates?.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            status="rejected"
          />
        ))}
      </ul>

      <Separator className="mb-6" />

      <h2 className="mb-3 text-lg font-semibold">Published hackathons</h2>

      {hackathonsError && (
        <p className="text-sm text-destructive">
          Failed to load hackathons: {hackathonsError.message}
        </p>
      )}

      {!hackathonsError && hackathons?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No rejected hackathons{query ? ` matching "${query}"` : ""}.
        </p>
      )}

      <ul className="space-y-3">
        {hackathons?.map((hackathon) => (
          <PublishedHackathonCard
            key={hackathon.id}
            hackathon={hackathon}
            tab="rejected"
          />
        ))}
      </ul>
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

      <ul className="space-y-3">
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

      <ul className="space-y-3">
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
}: {
  candidate: CandidateRow;
  status: "pending" | "rejected";
}) {
  return (
    <li>
      <SharedHackathonCard
        hackathon={candidateToHackathonCardData(candidate)}
        compact
        titleLink
        meta={<CandidateContext candidate={candidate} status={status} />}
        actions={
          <div className="flex w-full flex-wrap items-center justify-end gap-1">
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
            <EditCandidateDialog candidate={candidate} />
            {status !== "rejected" && (
              <form
                action={rejectCandidateAction.bind(
                  null,
                  candidate.id,
                  undefined,
                )}
              >
                <Button
                  type="submit"
                  variant="destructive"
                  size="icon"
                  title="Reject"
                  aria-label="Reject"
                >
                  <X aria-hidden="true" />
                </Button>
              </form>
            )}
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
}: {
  candidate: CandidateRow;
  status: "pending" | "rejected";
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground"
      aria-label="Candidate source details"
    >
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
      <Card className="gap-0 py-0">
        <CardContent className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <a
              href={hackathon.url}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {hackathon.name}
            </a>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(hackathon.city || hackathon.country_code) && (
                <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
                  {[hackathon.city, hackathon.country_code]
                    .filter(Boolean)
                    .join(", ")}
                </Badge>
              )}
              <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                {hackathon.source}
              </Badge>
              <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                {new Date(hackathon.date_start).toLocaleDateString()}
              </Badge>
              {hackathon.status === "estimated" && (
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-[11px]"
                  title="No structured date was recoverable when this was approved - date_start is a placeholder used only to sort it into Approved/Past (issue #102)."
                >
                  Date estimated
                </Badge>
              )}
            </div>
            {tab === "archived" && hackathon.archived_at && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Archived {new Date(hackathon.archived_at).toLocaleDateString()}
                {hackathon.archived_reason
                  ? ` - ${hackathon.archived_reason}`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {tab === "archived" && (
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
            )}
            {tab === "pending" && (
              <HackathonModerationAction
                hackathon={hackathon}
                label="Approve"
                state="approved"
                icon={Check}
              />
            )}
            {tab === "rejected" && (
              <>
                <HackathonModerationAction
                  hackathon={hackathon}
                  label="Approve"
                  state="approved"
                  icon={Check}
                />
                <HackathonModerationAction
                  hackathon={hackathon}
                  label="Move to pending"
                  state="pending"
                  icon={Clock3}
                />
              </>
            )}
            {(tab === "approved" || tab === "past") && (
              <HackathonModerationAction
                hackathon={hackathon}
                label="Move to pending"
                state="pending"
                icon={Clock3}
              />
            )}
            <EditHackathonDialog hackathon={hackathon} />
            {(tab === "approved" || tab === "past") && (
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
                  title="Archive (remove from the public listing, reversible)"
                >
                  <Archive aria-hidden="true" />
                </Button>
              </form>
            )}
            {(tab === "pending" || tab === "approved" || tab === "past") && (
              <HackathonModerationAction
                hackathon={hackathon}
                label="Reject"
                state="rejected"
                icon={X}
              />
            )}
            <form action={deleteHackathonAction.bind(null, hackathon.id)}>
              <ConfirmDeleteButton
                confirmMessage={`Permanently delete "${hackathon.name}" from the live site? This cannot be undone.`}
              />
            </form>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function HackathonModerationAction({
  hackathon,
  label,
  state,
  icon: Icon,
}: {
  hackathon: HackathonRow;
  label: string;
  state: ModerationState;
  icon: typeof Check;
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
        title={label}
        aria-label={label}
      >
        <Icon aria-hidden="true" />
      </Button>
    </form>
  );
}
