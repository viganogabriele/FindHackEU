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
import type { Database } from "@/types/database";
import { deleteHackathonAction } from "./actions";
import { GoogleSignInButton } from "../candidates/google-sign-in-button";
import { SignOutButton } from "../candidates/sign-out-button";
import { getAdminAuthStatus } from "@/lib/services/require-admin-auth";

type HackathonRow = Database["public"]["Tables"]["hackathons"]["Row"];

type StatusFilter = "upcoming" | "past" | "estimated";

const STATUSES: StatusFilter[] = ["upcoming", "past", "estimated"];

/**
 * Manage already-published hackathons (delete a wrong/unwanted one) -
 * requested directly by the maintainer alongside the equivalent delete on
 * /admin/candidates (2026-09-01), after finding a real published event
 * (an Eventbrite "Social Hackathon Umbria" listing) that passed the
 * classifier correctly but wasn't the kind of hackathon wanted listed -
 * see app/admin/hackathons/actions.ts's doc comment for the full story.
 *
 * Same gating as /admin/candidates: dev-only (NODE_ENV) AND real Google
 * sign-in auth (issue #67), both re-checked server-side in every action,
 * not just here.
 */
export default async function HackathonsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
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
    : "upcoming";
  const query = params.q?.trim() ?? "";

  let dbQuery = supabaseAdmin
    .from("hackathons")
    .select("*")
    .eq("status", status)
    .order("date_start", { ascending: status !== "past" })
    .limit(200);

  if (query) {
    dbQuery = dbQuery.ilike("name", `%${query}%`);
  }

  // Cast, not trusted Supabase inference - see
  // lib/services/promote-candidate.ts's doc comment for why this repo's
  // current Supabase client setup resolves a direct `.select()` result to
  // `never`.
  const { data: hackathonsData, error } = await dbQuery;
  const hackathons = hackathonsData as HackathonRow[] | null;

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
            <h1 className="mb-2 text-2xl font-bold">Manage hackathons</h1>
            <p className="text-sm text-muted-foreground">
              Published, public hackathons. Deleting one removes it from the
              live site immediately - this cannot be undone.
            </p>
          </div>
          <SignOutButton email={authStatus.email!} />
        </div>

        <Button asChild variant="link" size="sm" className="mb-4 -ml-3">
          <Link href="/admin/candidates">Review candidates instead →</Link>
        </Button>

        <form className="mb-6 flex gap-2" method="get">
          <input type="hidden" name="status" value={status} />
          <Input
            type="search"
            name="q"
            placeholder="Search by name…"
            defaultValue={query}
            className="max-w-sm"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>

        <nav className="mb-6 flex gap-2">
          {STATUSES.map((s) => (
            <Button
              key={s}
              asChild
              variant={s === status ? "default" : "outline"}
              size="sm"
            >
              <a
                href={`/admin/hackathons?status=${s}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </a>
            </Button>
          ))}
        </nav>

        {error && (
          <p className="text-sm text-destructive">
            Failed to load hackathons: {error.message}
          </p>
        )}

        {!error && hackathons?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No {status} hackathons{query ? ` matching "${query}"` : ""}.
          </p>
        )}

        <ul className="space-y-3">
          {hackathons?.map((hackathon) => (
            <HackathonCard key={hackathon.id} hackathon={hackathon} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SignInGate({ email }: { email: string | null }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-xl font-bold">Admin sign-in required</h1>
          <p className="text-sm text-muted-foreground">
            Managing published hackathons is restricted to the project
            maintainer.
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
