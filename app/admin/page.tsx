import { notFound, redirect } from "next/navigation";

/**
 * `/admin` is the canonical shortcut to the unified candidate moderation
 * dashboard. The destination owns the Google sign-in gate, so the same gate
 * remains in place without an extra landing screen.
 */
export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const params = await searchParams;
  redirect(
    params.error
      ? `/admin/candidates?error=${encodeURIComponent(params.error)}`
      : "/admin/candidates",
  );
}
