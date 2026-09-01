import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
import { deleteHackathonAction } from "../hackathons/actions";
import { ManualSubmitForm } from "./manual-submit-form";
import { EditCandidateDialog } from "./edit-candidate-dialog";
import { GoogleSignInButton } from "./google-sign-in-button";
import { SignOutButton } from "./sign-out-button";
import { getAdminAuthStatus } from "@/lib/services/require-admin-auth";
import { cleanRawSnippet } from "@/lib/format-snippet";
import { getAutoPublishBlockers } from "@/lib/discovery/web-search-candidates";
import { candidateToHackathonCardData } from "./candidate-card-data";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];
type HackathonRow = Database["public"]["Tables"]["hackathons"]["Row"];

type StatusFilter = "pending" | "approved" | "rejected";
type HackathonStatusFilter = "upcoming" | "past" | "estimated";

const STATUSES: StatusFilter[] = ["pending", "approved", "rejected"];
const HACKATHON_STATUSES: HackathonStatusFilter[] = [
  "upcoming",
  "past",
  "estimated",
];

/**
 * Review queue for web-search-discovered event candidates (issue #12,
 * #13/#14/#17 - see docs/discovery-research.md and the
 * hackathon_candidates migration). Nothing here is auto-published:
 * "Approve" is the only path that copies a candidate into the real
 * `hackathons` table (lib/services/promote-candidate.ts).
 *
 * The "Approved" tab (issue #82) is special: it does NOT list
 * `hackathon_candidates` rows with `status = 'approved'`. Most published
 * hackathons never went through the candidate-review flow at all - they
 * came from the main scraping pipeline (app/api/update/route.ts, sources
 * like luma/devfolio/mlh/ethglobal/eventbrite) - so scoping "Approved" to
 * candidate-sourced rows would only ever surface a small minority of what's
 * actually live. Instead, "Approved" queries the `hackathons` table
 * directly (same shape /admin/hackathons used to: status/search filters,
 * deleteHackathonAction for management) so every published hackathon,
 * regardless of source, is manageable from one page. This makes the
 * standalone /admin/hackathons route redundant - it now just redirects
 * here (see app/admin/hackathons/page.tsx).
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
    hstatus?: string;
    q?: string;
    error?: string;
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

  if (status === "approved") {
    const hackathonStatus: HackathonStatusFilter = HACKATHON_STATUSES.includes(
      params.hstatus as HackathonStatusFilter,
    )
      ? (params.hstatus as HackathonStatusFilter)
      : "upcoming";

    let hackathonsQuery = supabaseAdmin
      .from("hackathons")
      .select("*")
      .eq("status", hackathonStatus)
      .order("date_start", { ascending: hackathonStatus !== "past" })
      .limit(200);

    if (query) {
      hackathonsQuery = hackathonsQuery.ilike("name", `%${query}%`);
    }

    const { data: hackathonsData, error: hackathonsError } =
      await hackathonsQuery;
    const hackathons = hackathonsData as HackathonRow[] | null;

    return (
      <AdminShell authStatus={authStatus} status={status} query={query}>
        <StatusNav status={status} query={query} />

        <nav className="mb-6 flex gap-2">
          {HACKATHON_STATUSES.map((s) => (
            <Button
              key={s}
              asChild
              variant={s === hackathonStatus ? "default" : "outline"}
              size="sm"
            >
              <a
                href={`/admin/candidates?status=approved&hstatus=${s}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </a>
            </Button>
          ))}
        </nav>

        {hackathonsError && (
          <p className="text-sm text-destructive">
            Failed to load hackathons: {hackathonsError.message}
          </p>
        )}

        {!hackathonsError && hackathons?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No {hackathonStatus} hackathons{query ? ` matching "${query}"` : ""}
            .
          </p>
        )}

        <ul className="space-y-3">
          {hackathons?.map((hackathon) => (
            <HackathonCard key={hackathon.id} hackathon={hackathon} />
          ))}
        </ul>
      </AdminShell>
    );
  }

  let dbQuery = supabaseAdmin
    .from("hackathon_candidates")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  // Search by more than just name (issue #83) - the maintainer wants to
  // narrow a large queue by city/country/the discovery query text too, not
  // just the candidate's name. Each value is quoted (PostgREST's `.or()`
  // filter list is comma-separated, and quoting is how it lets a value
  // itself contain a comma/parenthesis without breaking the filter) with
  // backslashes/quotes escaped for that quoted form.
  if (query) {
    const escaped = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const pattern = `"%${escaped}%"`;
    dbQuery = dbQuery.or(
      `name.ilike.${pattern},city.ilike.${pattern},country_code.ilike.${pattern},query.ilike.${pattern}`,
    );
  }

  // Cast, not trusted Supabase inference - see lib/services/promote-candidate.ts's
  // doc comment for why this repo's current Supabase client setup resolves
  // a direct `.select()` result to `never`.
  const { data: candidatesData, error } = await dbQuery;

  const candidates = candidatesData as CandidateRow[] | null;

  return (
    <AdminShell
      authStatus={authStatus}
      status={status}
      query={query}
      showManualForm
    >
      <StatusNav status={status} query={query} />

      {error && (
        <p className="text-sm text-destructive">
          Failed to load candidates: {error.message}
        </p>
      )}

      {!error && candidates?.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No {status} candidates{query ? ` matching "${query}"` : ""}.
        </p>
      )}

      <ul className="space-y-4">
        {candidates?.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            status={status}
          />
        ))}
      </ul>
    </AdminShell>
  );
}

/**
 * Shared chrome (back link, header, dashboard cross-link, sign-out, search
 * form) for both the candidate-review tabs and the Approved tab's
 * published-hackathons view - the two views differ in what's below the
 * search form (a status sub-nav and CandidateCard/HackathonCard lists), not
 * in this shell.
 */
function AdminShell({
  authStatus,
  status,
  query,
  showManualForm = false,
  children,
}: {
  authStatus: Awaited<ReturnType<typeof getAdminAuthStatus>>;
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
              Web-search candidates for review, plus published hackathons under
              Approved. Only Approved is public.
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

/**
 * The Pending/Approved/Rejected tab selector. Kept separate from AdminShell
 * because the Approved branch renders an additional status sub-nav (see
 * above) between this and its list.
 */
function StatusNav({ status, query }: { status: StatusFilter; query: string }) {
  return (
    <nav className="mb-6 flex gap-2">
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
 * Pending/Rejected candidate card (issue #93). Renders the candidate as a
 * real hackathon card - same date/location/topics presentation the public
 * site uses once the event is published - via the shared `HackathonCard`
 * (components/hackathon-card.tsx), mapped through
 * `candidateToHackathonCardData` since a `hackathon_candidates` row isn't
 * shaped like a `hackathons` row. The admin-only "how it was found" context
 * (source/extraction-method/conflict badges, the query, the cleaned
 * snippet, and the auto-publish-blocker text from issue #78) sits in a
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
 */
function CandidateCard({
  candidate,
  status,
}: {
  candidate: CandidateRow;
  status: StatusFilter;
}) {
  return (
    <li className="space-y-2">
      <SharedHackathonCard
        hackathon={candidateToHackathonCardData(candidate)}
        actions={
          <div className="flex w-full flex-wrap items-center gap-2">
            {status !== "approved" && (
              <form action={approveCandidateAction.bind(null, candidate.id)}>
                <Button type="submit" variant="default">
                  {status === "rejected" ? "Approve anyway" : "Approve"}
                </Button>
              </form>
            )}
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
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <a
            href={candidate.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate hover:underline"
          >
            {candidate.url}
          </a>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{candidate.search_provider}</Badge>
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
              <Badge variant="destructive">
                Conflicting title (issue #15) - check page before approving
              </Badge>
            )}
          </div>

          <p>Query: &ldquo;{candidate.query}&rdquo;</p>

          {candidate.raw_snippet && (
            <p className="line-clamp-3 rounded-md bg-muted p-2">
              {cleanRawSnippet(candidate.raw_snippet)}
            </p>
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
 * #78), by calling `getAutoPublishBlockers` - the same function
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
    <p className="mb-4 text-xs text-muted-foreground">
      Not auto-published: {blockers.join("; ")}.
    </p>
  );
}

/**
 * A published `hackathons` row, shown on the Approved tab (issue #82) -
 * ported from the now-retired /admin/hackathons page, same shape and same
 * `deleteHackathonAction`. Deliberately a different card than
 * `CandidateCard`: a published hackathon has no approve/reject workflow,
 * only delete.
 */
function HackathonCard({ hackathon }: { hackathon: HackathonRow }) {
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
            </div>
          </div>
          <form action={deleteHackathonAction.bind(null, hackathon.id)}>
            <ConfirmDeleteButton
              confirmMessage={`Permanently delete "${hackathon.name}" from the live site? This cannot be undone.`}
            />
          </form>
        </CardContent>
      </Card>
    </li>
  );
}
