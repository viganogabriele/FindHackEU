import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Archive, ArchiveRestore } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  hackathonsByModerationStateQuery,
  approvedOrPastHackathonsQuery,
  archivedHackathonsQuery,
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

  if (status === "approved" || status === "past") {
    return (
      <ApprovedOrPastTab kind={status} authStatus={authStatus} query={query} />
    );
  }

  if (status === "archived") {
    return <ArchivedTab authStatus={authStatus} query={query} />;
  }

  if (status === "rejected") {
    return <RejectedTab authStatus={authStatus} query={query} />;
  }

  return (
    <PendingTab
      authStatus={authStatus}
      query={query}
      blockerCodes={blockerCodes}
    />
  );
}

/**
 * Shared chrome (back link, header, dashboard cross-link, sign-out, search
 * form) for all five tabs.
 */
function AdminShell({
  authStatus,
  status,
  query,
  showManualForm = false,
  children,
}: {
  authStatus: AuthStatus;
  status: StatusFilter;
  query: string;
  showManualForm?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to site
          </Link>
        </Button>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="mb-2 text-2xl font-bold">Hackathon candidates</h1>
            <p className="text-sm text-muted-foreground">
              Every hackathon - web-search candidate or published, regardless of
              origin - is in exactly one of Pending/Approved/Rejected/
              Past/Archived, and can be moved between Pending/Approved/ Rejected
              here. Only Approved and Past are public; Archived is purely 1-year
              retention, separate from an editorial Rejected.
            </p>
          </div>
          <SignOutButton email={authStatus.email!} />
        </div>

        <div className="mb-4 -ml-3 flex flex-wrap items-center gap-1">
          <Button asChild variant="link" size="sm">
            <Link href="/admin">← Admin dashboard</Link>
          </Button>
        </div>

        {showManualForm && <ManualSubmitForm />}

        <form className="mb-6 flex gap-2" method="get">
          <input type="hidden" name="status" value={status} />
          <Input
            type="search"
            name="q"
            placeholder="Search by name, city, country, or query…"
            defaultValue={query}
            className="max-w-sm"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        {children}
      </div>
    </div>
  );
}

/** The five-tab selector shared by every tab render branch. */
function StatusNav({ status, query }: { status: StatusFilter; query: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-2">
      {STATUSES.map((s) => (
        <Button
          key={s}
          asChild
          variant={s === status ? "default" : "outline"}
          size="sm"
        >
          <a
            href={`/admin/candidates?status=${s}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </a>
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
}: {
  authStatus: AuthStatus;
  query: string;
  blockerCodes: AutoPublishBlockerCode[];
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
      showManualForm
    >
      <StatusNav status="pending" query={query} />

      <h2 className="mb-3 text-lg font-semibold">From candidate review</h2>

      <PendingReasonFilter query={query} selectedCodes={blockerCodes} />

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

      <ul className="mb-8 space-y-4">
        {visibleCandidates?.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            status="pending"
          />
        ))}
      </ul>

      <Separator className="mb-6" />

      <h2 className="mb-1 text-lg font-semibold">From published hackathons</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Already-published hackathons moved back to pending for re-review - never
        auto-populated, only reachable via &quot;Move to pending&quot; on an
        Approved/Past/Rejected card.
      </p>

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
    <form
      method="get"
      className="mb-4 rounded-md border bg-muted/30 p-3"
      aria-label="Filter pending candidates"
    >
      <input type="hidden" name="status" value="pending" />
      {query && <input type="hidden" name="q" value={query} />}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          Filter by pending reason
        </legend>
        <div className="flex flex-wrap gap-2">
          {AUTO_PUBLISH_BLOCKER_TAGS.map((tag) => (
            <label
              key={tag.code}
              className="flex cursor-pointer items-center gap-1.5"
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
          Apply filters
        </Button>
        {selectedCodes.length > 0 && (
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href={clearHref}>Clear filters</Link>
          </Button>
        )}
      </div>
    </form>
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
}: {
  authStatus: AuthStatus;
  query: string;
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
    <AdminShell authStatus={authStatus} status="rejected" query={query}>
      <StatusNav status="rejected" query={query} />

      <h2 className="mb-3 text-lg font-semibold">From candidate review</h2>

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

      <ul className="mb-8 space-y-4">
        {candidates?.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            status="rejected"
          />
        ))}
      </ul>

      <Separator className="mb-6" />

      <h2 className="mb-1 text-lg font-semibold">From published hackathons</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Published hackathons rejected after the fact - an editorial &quot;no
        longer belongs on the site&quot; call, distinct from Archived (1-year
        retention) below.
      </p>

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
}: {
  kind: "approved" | "past";
  authStatus: AuthStatus;
  query: string;
}) {
  const { data, error } = await approvedOrPastHackathonsQuery(
    supabaseAdmin,
    kind,
    query,
  );

  const hackathons = data as HackathonRow[] | null;

  return (
    <AdminShell authStatus={authStatus} status={kind} query={query}>
      <StatusNav status={kind} query={query} />

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
}: {
  authStatus: AuthStatus;
  query: string;
}) {
  const { data, error } = await archivedHackathonsQuery(supabaseAdmin, query);
  const hackathons = data as HackathonRow[] | null;

  return (
    <AdminShell authStatus={authStatus} status="archived" query={query}>
      <StatusNav status="archived" query={query} />

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
 * (source, search provider, query, and compact reason tags) sits in a
 * second, visually secondary card directly below it rather than being
 * folded into the hackathon card itself - that context is about the
 * candidate row, not about what the event will look like once published.
 *
 * The footer is an admin action bar (Approve, Reject-or-Delete, Edit)
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
    <li className="space-y-2">
      <SharedHackathonCard
        hackathon={candidateToHackathonCardData(candidate)}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2">
            <form action={approveCandidateAction.bind(null, candidate.id)}>
              <Button type="submit" variant="default">
                {status === "rejected" ? "Approve anyway" : "Approve"}
              </Button>
            </form>
            {status !== "rejected" && (
              <form
                action={rejectCandidateAction.bind(
                  null,
                  candidate.id,
                  undefined,
                )}
              >
                <Button type="submit" variant="outline">
                  Reject
                </Button>
              </form>
            )}
            <form action={deleteCandidateAction.bind(null, candidate.id)}>
              <ConfirmDeleteButton
                confirmMessage={`Permanently delete "${candidate.name}"? This cannot be undone.`}
              />
            </form>
            <EditCandidateDialog candidate={candidate} />
          </div>
        }
      />

      <Card className="border-dashed">
        <CardContent className="space-y-3">
          <a
            href={candidate.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-muted-foreground hover:underline"
          >
            {candidate.url}
          </a>

          <div className="space-y-1 text-sm text-foreground">
            <p>
              <span className="font-medium">Source:</span> {candidate.source}
            </p>
            <p>
              <span className="font-medium">Search provider:</span>{" "}
              {candidate.search_provider}
            </p>
            <p className="break-words">
              <span className="font-medium">Query:</span> &ldquo;
              {candidate.query}&rdquo;
            </p>
          </div>

          {status === "rejected" && (
            <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
              <Badge
                variant={
                  candidate.extraction_method === "jsonld-event"
                    ? "default"
                    : candidate.extraction_method === "og-meta"
                      ? "secondary"
                      : "outline"
                }
              >
                {candidate.extraction_method}
              </Badge>
              {candidate.has_conflict && (
                <Badge variant="destructive">Conflicting page data</Badge>
              )}
            </div>
          )}

          {status === "pending" && (
            <AutoPublishBlockers candidate={candidate} />
          )}
        </CardContent>
      </Card>
    </li>
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
        <Badge key={blocker.code} variant="outline" title={blocker.label}>
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
 * `tab` drives which action buttons render:
 *   - "pending"            -> Approve / Reject (via `HackathonModerationActions`)
 *   - "approved" / "past"  -> Move to pending / Reject, plus Archive (issue #72)
 *   - "rejected"           -> Approve / Move to pending
 *   - "archived"           -> none (must Unarchive first - archiving doesn't
 *                              touch moderation_state, so unarchiving alone
 *                              restores it to wherever it already was)
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
      <Card>
        <CardContent className="flex items-start justify-between gap-2">
          <div>
            <a
              href={hackathon.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
            >
              {hackathon.name}
            </a>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {hackathon.city && (
                <Badge variant="secondary">{hackathon.city}</Badge>
              )}
              {hackathon.country_code && (
                <Badge variant="secondary">{hackathon.country_code}</Badge>
              )}
              <Badge variant="outline">{hackathon.source}</Badge>
              <Badge variant="outline">
                {new Date(hackathon.date_start).toLocaleDateString()}
              </Badge>
              {hackathon.status === "estimated" && (
                <Badge
                  variant="outline"
                  title="No structured date was recoverable when this was approved - date_start is a placeholder used only to sort it into Approved/Past (issue #102)."
                >
                  Date estimated
                </Badge>
              )}
            </div>
            {tab === "archived" && hackathon.archived_at && (
              <p className="mt-2 text-xs text-muted-foreground">
                Archived {new Date(hackathon.archived_at).toLocaleDateString()}
                {hackathon.archived_reason
                  ? ` - ${hackathon.archived_reason}`
                  : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <EditHackathonDialog hackathon={hackathon} />
            <HackathonModerationActions hackathon={hackathon} tab={tab} />
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
                  variant="ghost"
                  size="icon"
                  title="Archive (remove from the public listing, reversible)"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              </form>
            )}
            {tab === "archived" && (
              <form action={unarchiveHackathonAction.bind(null, hackathon.id)}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon"
                  title="Unarchive (restore to the public listing)"
                >
                  <ArchiveRestore className="h-4 w-4" />
                </Button>
              </form>
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

/**
 * The moderation-state transition buttons for a `PublishedHackathonCard`
 * (issue #102) - all backed by the single
 * `setHackathonModerationStateAction(hackathonId, state)` server action
 * (../hackathons/actions.ts), just bound to a different target state per
 * tab. No buttons on "archived" - see `PublishedHackathonCard`'s doc
 * comment for why.
 */
function HackathonModerationActions({
  hackathon,
  tab,
}: {
  hackathon: HackathonRow;
  tab: PublishedHackathonTab;
}) {
  if (tab === "archived") {
    return null;
  }

  const transitions: Array<{ label: string; state: ModerationState }> =
    tab === "pending"
      ? [
          { label: "Approve", state: "approved" },
          { label: "Reject", state: "rejected" },
        ]
      : tab === "rejected"
        ? [
            { label: "Approve", state: "approved" },
            { label: "Move to pending", state: "pending" },
          ]
        : [
            // "approved" or "past"
            { label: "Move to pending", state: "pending" },
            { label: "Reject", state: "rejected" },
          ];

  return (
    <>
      {transitions.map(({ label, state }, index) => (
        <form
          key={state}
          action={setHackathonModerationStateAction.bind(
            null,
            hackathon.id,
            state,
          )}
        >
          <Button
            type="submit"
            variant={index === 0 ? "default" : "outline"}
            size="sm"
          >
            {label}
          </Button>
        </form>
      ))}
    </>
  );
}
