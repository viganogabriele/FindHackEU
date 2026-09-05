"use client";

import Link from "next/link";
import { useTranslation } from "@/contexts/translation-context";
import { Toaster } from "@/components/ui/sonner";

const MAINTAINER_EMAIL = "info@viganogabriele.com";

export function SiteFooter() {
  const { t } = useTranslation();
  const links = [
    { href: "/docs", label: t("external.docs") },
    { href: "/privacy", label: t("external.privacy") },
    { href: "/terms", label: t("external.terms") },
    { href: `mailto:${MAINTAINER_EMAIL}`, label: t("external.contact") },
  ];

  // Collapsed to a single row (maintainer feedback: the previous
  // two-rows-with-a-separator layout "doesn't make much sense") and
  // re-attributed to the maintainer by name, matching how
  // app/privacy/page.tsx, app/terms/page.tsx, and README.md already credit
  // "Gabriele Viganò" - not the generic "FindHackEU" the copyright line
  // used before. MIT still requires the copyright notice be preserved,
  // just correctly attributed to the actual person, with a mailto contact
  // link alongside the existing Docs/Privacy/Terms links so the project is
  // clearly reachable back to its maintainer.
  return (
    <footer className="mt-auto border-t bg-black text-white">
      <div className="mx-auto grid max-w-screen-2xl gap-5 px-4 py-7 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            H
          </span>
          <span>
            FindHackEU
            <span className="mt-0.5 block font-normal text-white/60 sm:ml-2 sm:inline">
              © {new Date().getFullYear()} Gabriele Viganò
            </span>
          </span>
        </div>
        <nav
          className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-white/70 sm:flex sm:flex-wrap"
          aria-label={t("support")}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <Toaster />
    </footer>
  );
}
