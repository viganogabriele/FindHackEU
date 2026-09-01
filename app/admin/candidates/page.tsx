import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Database } from "@/types/database";
import { approveCandidateAction, rejectCandidateAction } from "./actions";
import { ManualSubmitForm } from "./manual-submit-form";
import { isDevOnlyEnabled } from "@/lib/admin/dev-only";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];

type StatusFilter = "pending" | "approved" | "rejected";

const STATUSES: StatusFilter[] = ["pending", "approved", "rejected"];

/**
 * Review queue for web-search-discovered event candidates (issue #12,
 * #13/#14/#17 - see docs/discovery-research.md and the
 * hackathon_candidates migration). Nothing here is auto-published:
 * "Approve" is the only path that copies a candidate into the real
 * `hackathons` table (lib/services/promote-candidate.ts).
 *
 * Dev-only for now (`notFound()` outside an explicit development runtime,
 * same pattern as app/api/dev/trigger-update/route.ts) - this page can
 * approve/reject real data with no authentication check of its own. Preview
 * and staging runtimes are intentionally closed too. Do not remove this gate
 * without adding real auth first - see issue #67 (Google sign-in via Supabase
 * Auth) before ever enabling this in a deployed environment.
 */
export default async function CandidatesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (!isDevOnlyEnabled()) {
    notFound();
  }

  const params = await searchParams;
  const status: StatusFilter = STATUSES.includes(params.status as StatusFilter)
    ? (params.status as StatusFilter)
    : "pending";

  // Cast, not trusted Supabase inference - see lib/services/promote-candidate.ts's
  // doc comment for why this repo's current Supabase client setup resolves
  // a direct `.select()` result to `never`.
  const { data: candidatesData, error } = await supabaseAdmin
    .from("hackathon_candidates")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);

  const candidates = candidatesData as CandidateRow[] | null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold">Hackathon candidates</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Web-search-discovered events awaiting review. Nothing here is public
          until approved.
        </p>

        <ManualSubmitForm />

        <nav className="mb-6 flex gap-2">
          {STATUSES.map((s) => (
            <Button
              key={s}
              asChild
              variant={s === status ? "default" : "outline"}
              size="sm"
            >
              <a href={`/admin/candidates?status=${s}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </a>
            </Button>
          ))}
        </nav>

        {error && (
          <p className="text-sm text-destructive">
            Failed to load candidates: {error.message}
          </p>
        )}

        {!error && candidates?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No {status} candidates.
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
      </div>
    </div>
  );
}

function CandidateCard({
  candidate,
  status,
}: {
  candidate: CandidateRow;
  status: StatusFilter;
}) {
  return (
    <li className="rounded-lg border p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <a
            href={candidate.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline"
          >
            {candidate.name}
          </a>
          <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
            {candidate.city && (
              <Badge variant="secondary">{candidate.city}</Badge>
            )}
            {candidate.country_code && (
              <Badge variant="secondary">{candidate.country_code}</Badge>
            )}
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
        </div>
      </div>

      <p className="mb-2 text-xs text-muted-foreground">
        Query: &ldquo;{candidate.query}&rdquo;
        {candidate.date_start &&
          ` · ${new Date(candidate.date_start).toLocaleDateString()}`}
      </p>

      {candidate.raw_snippet && (
        <p className="mb-3 line-clamp-3 rounded bg-muted p-2 text-xs text-muted-foreground">
          {candidate.raw_snippet}
        </p>
      )}

      <div className="flex gap-2">
        {status !== "approved" && (
          <form action={approveCandidateAction.bind(null, candidate.id)}>
            <Button type="submit" size="sm" variant="default">
              {status === "rejected" ? "Approve anyway" : "Approve"}
            </Button>
          </form>
        )}
        {status !== "rejected" && (
          <form
            action={rejectCandidateAction.bind(null, candidate.id, undefined)}
          >
            <Button type="submit" size="sm" variant="outline">
              Reject
            </Button>
          </form>
        )}
      </div>
    </li>
  );
}
