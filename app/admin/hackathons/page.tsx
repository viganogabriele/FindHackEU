import { notFound, redirect } from "next/navigation";

/**
 * Retired (issue #82): published-hackathon management now lives on
 * /admin/candidates's Approved tab, which queries the `hackathons` table
 * directly - see that page's doc comment for the full reasoning. This
 * route is kept only as a redirect so an old bookmark/link still lands
 * somewhere useful instead of a bare 404; `deleteHackathonAction` (still in
 * ./actions.ts) is now called from the Approved tab, not from a page here.
 *
 * Same dev-only gate as every other admin route, kept for consistency even
 * though a redirect itself needs no auth - the destination re-checks auth
 * on its own.
 */
export default function HackathonsAdminPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  redirect("/admin/candidates?status=approved");
}
