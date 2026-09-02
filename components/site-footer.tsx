"use client";

import Link from "next/link";
import { useTranslation } from "@/contexts/translation-context";
import { Toaster } from "@/components/ui/sonner";

export function SiteFooter() {
  const { t } = useTranslation();
  const links = [
    { href: "/docs", label: t("external.docs") },
    { href: "/privacy", label: t("external.privacy") },
    { href: "/terms", label: t("external.terms") },
  ];

  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <span>FindHackEU</span>
        <nav
          className="flex flex-wrap gap-x-5 gap-y-2"
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
