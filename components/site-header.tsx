"use client";

import Link from "next/link";
import { Github } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import LanguageSelect from "@/components/language-select";
import { PublicSubmitForm } from "@/components/public-submit-form";
import { useTranslation } from "@/contexts/translation-context";
import { useAdminHomeHref } from "@/lib/use-admin-home-href";

export function SiteHeader() {
  const { t } = useTranslation();
  const logoHref = useAdminHomeHref();

  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex min-h-16 max-w-screen-2xl flex-wrap items-center justify-between gap-y-2 gap-x-3 px-4 sm:px-6 lg:px-8">
        <Link
          href={logoHref}
          className="shrink-0 text-base font-semibold tracking-tight"
        >
          FindHackEU
        </Link>
        <div className="flex items-center gap-2">
          <PublicSubmitForm />
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon" className="size-9">
              <Link
                href="https://github.com/viganogabriele/FindHackEU"
                target="_blank"
                rel="noreferrer"
                aria-label={t("external.github")}
                title={t("external.github")}
              >
                <Github className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <ThemeSwitcher compact />
            <LanguageSelect />
          </div>
        </div>
      </div>
    </header>
  );
}
