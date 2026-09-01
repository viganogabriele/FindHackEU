import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { Database } from "@/types/database";
import { approveCandidateAction, rejectCandidateAction } from "./actions";
import { ManualSubmitForm } from "./manual-submit-form";
import { GoogleSignInButton } from "./google-sign-in-button";
import { SignOutButton } from "./sign-out-button";
import { getAdminAuthStatus } from "@/lib/services/require-admin-auth";

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
 * Dev-only (`notFound()` outside development, same pattern as
 * app/api/dev/trigger-update/route.ts) AND gated behind Google sign-in via
 * Supabase Auth, restricted to a single allowlisted email
 * (`ADMIN_ALLOWED_EMAIL` - issue #67). Both gates are defense in depth: the
 * NODE_ENV check stays even though auth now exists, and the auth check is
 * also re-verified server-side inside every server action in ./actions.ts,
 * not just here.
 */
export default async function CandidatesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const authStatus = await getAdminAuthStatus();

  if (!authStatus.authorized) {
    return <SignInGate email={authStatus.email} />;
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
              Web-search-discovered events awaiting review. Nothing here is
              public until approved.
            </p>
          </div>
          <SignOutButton email={authStatus.email!} />
        </div>

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

/**
 * Shown instead of the review queue when there is no session, or the
 * session's email doesn't match `ADMIN_ALLOWED_EMAIL` (issue #67). This is
 * a convenience gate, not the real security boundary - see
 * app/admin/candidates/actions.ts's `assertAuthorized()`.
 */
function SignInGate({ email }: { email: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-bold">Admin sign-in required</h1>
          <p className="text-sm text-muted-foreground">
            The candidate review queue is restricted to the project maintainer.
          </p>
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

function CandidateCard({
  candidate,
  status,
}: {
  candidate: CandidateRow;
  status: StatusFilter;
}) {
  return (
    <li>
      <Card>
        <CardContent>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <a
                href={candidate.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
              >
                {candidate.name}
              </a>
              <div className="mt-2 flex flex-wrap gap-1.5">
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
            <p className="mb-4 line-clamp-3 rounded-md bg-muted p-2 text-xs text-muted-foreground">
              {candidate.raw_snippet}
            </p>
          )}

          <div className="flex gap-2">
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
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
