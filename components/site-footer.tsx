"use client";

import Link from "next/link";
import { useTranslation } from "@/contexts/translation-context";
import { Toaster } from "@/components/ui/sonner";
import { Separator } from "@/components/ui/separator";

export function SiteFooter() {
  const { t } = useTranslation();
  const links = [
    { href: "/docs", label: t("external.docs") },
    { href: "/privacy", label: t("external.privacy") },
    { href: "/terms", label: t("external.terms") },
  ];

  return (
    <footer className="mt-auto border-t bg-muted/20">
      <div className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              H
            </span>
            FindHackEU
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
        <Separator className="my-6" />
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} FindHackEU
        </p>
      </div>
      <Toaster />
    </footer>
  );
}
