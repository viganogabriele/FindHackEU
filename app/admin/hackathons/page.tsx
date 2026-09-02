import { redirect } from "next/navigation";

/**
 * Retired (issue #82): published-hackathon management now lives on
 * /admin's Approved tab, which queries the `hackathons` table
 * directly - see that page's doc comment for the full reasoning. This
 * route is kept only as a redirect so an old bookmark/link still lands
 * somewhere useful instead of a bare 404; `deleteHackathonAction` (still in
 * ./actions.ts) is now called from the Approved tab, not from a page here.
 *
 * Available in production too, matching /admin (maintainer request,
 * 2026-09-02) - a redirect itself needs no auth, and the destination
 * re-checks auth on its own regardless.
 */
export default function HackathonsAdminPage() {
  redirect("/admin?status=approved");
}
