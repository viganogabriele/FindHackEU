import { notFound, redirect } from "next/navigation";

/**
 * `/admin` is the canonical shortcut to the unified candidate moderation
 * dashboard. The destination owns the Google sign-in gate, so the same gate
 * remains in place without an extra landing screen.
 */
export default function AdminDashboardPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  redirect("/admin/candidates");
}
