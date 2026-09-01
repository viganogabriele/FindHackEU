import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ListChecks } from "lucide-react";
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
      <div className="container mx-auto max-w-5xl px-4 py-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/"
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-3 w-3" />
              Public site
            </Link>
            <h1 className="text-xl font-bold tracking-tight">
              Admin dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Internal tools for discovery and review.
            </p>
          </div>
          <SignOutButton email={authStatus.email!} />
        </header>

        <div className="grid gap-3 md:grid-cols-2">
          <Card className="gap-0 py-0">
            <CardHeader className="gap-1 px-4 py-3">
              <CardTitle>Manual pipeline trigger</CardTitle>
              <CardDescription>
                Test mode only - no notifications, no README commit. Use{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  npm run trigger-update -- --live
                </code>{" "}
                for a real run.
              </CardDescription>
            </CardHeader>
            <CardContent className="border-t px-4 py-3">
              <TriggerUpdateButton />
            </CardContent>
          </Card>

          <Link href="/admin/candidates" className="group block">
            <Card className="h-full gap-0 py-0 transition-colors group-hover:border-primary/60">
              <CardHeader className="gap-1 px-4 py-3">
                <CardTitle className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4" />
                  Review &amp; manage hackathons
                </CardTitle>
                <CardDescription>
                  Review candidates and manage published hackathons in one
                  place.
                </CardDescription>
              </CardHeader>
              <CardContent className="border-t px-4 py-3">
                <span className="inline-flex items-center text-sm font-medium text-primary">
                  Open{" "}
                  <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
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
