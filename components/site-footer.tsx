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
    <footer className="mt-auto border-t bg-muted/20">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            H
          </span>
          <span>
            FindHackEU
            <span className="ml-2 font-normal text-muted-foreground">
              © {new Date().getFullYear()} Gabriele Viganò
            </span>
          </span>
        </div>
        <nav
          className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground"
          aria-label={t("support")}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
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
