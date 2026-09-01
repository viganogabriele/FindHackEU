import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ListChecks,
  CalendarCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAdminAuthStatus } from "@/lib/services/require-admin-auth";
import { GoogleSignInButton } from "./candidates/google-sign-in-button";
import { SignOutButton } from "./candidates/sign-out-button";
import { TriggerUpdateButton } from "./trigger-update-button";

/**
 * Single authenticated entry point for every dev/admin action in this app
 * (issue #81). Previously, admin functionality was scattered: a manual
 * pipeline trigger lived in the public sidebar (gated only by
 * `NODE_ENV !== "production"`, weaker than real admin auth), and
 * `/admin/candidates`/`/admin/hackathons` had no shared landing page - a
 * maintainer had to already know either URL existed.
 *
 * Originally linked to two separate pages (/admin/candidates and
 * /admin/hackathons); issue #82 merged published-hackathon management into
 * the candidates page's Approved tab and retired /admin/hackathons as a
 * standalone route (it now just redirects), so this dashboard links to
 * /admin/candidates only, plus the trigger-update button moved here from
 * the sidebar.
 *
 * Same gating pattern as the other admin pages: dev-only (`notFound()`
 * outside development) AND real Google sign-in auth restricted to
 * `ADMIN_ALLOWED_EMAIL` (issue #67).
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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
            <h1 className="mb-2 text-2xl font-bold">Admin dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Everything that shouldn&apos;t be publicly visible, in one place.
            </p>
          </div>
          <SignOutButton email={authStatus.email!} />
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Manual pipeline trigger</CardTitle>
            <CardDescription>
              Runs the discovery pipeline once, always in test mode - no
              Discord/Telegram/Twitter notifications and no README commit. Use{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                npm run trigger-update -- --live
              </code>{" "}
              for a real run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TriggerUpdateButton />
          </CardContent>
        </Card>

        <Separator className="mb-6" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/admin/candidates" className="block">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Review candidates
                </CardTitle>
                <CardDescription>
                  Web-search-discovered events awaiting review - approve,
                  reject, or manually submit a URL.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="inline-flex items-center text-sm font-medium text-primary">
                  Open <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/candidates?status=approved" className="block">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarCheck2 className="h-4 w-4" />
                  Manage hackathons
                </CardTitle>
                <CardDescription>
                  Already-published, public hackathons (Approved tab) - delete a
                  wrong or unwanted one.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="inline-flex items-center text-sm font-medium text-primary">
                  Open <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * Shown instead of the dashboard when there is no session, or the session's
 * email doesn't match `ADMIN_ALLOWED_EMAIL` (issue #67) - mirrors the
 * equivalent gate on /admin/candidates and /admin/hackathons. This is a
 * convenience gate, not the real security boundary.
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
            The admin dashboard is restricted to the project maintainer.
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
          <GoogleSignInButton next="/admin" />
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
