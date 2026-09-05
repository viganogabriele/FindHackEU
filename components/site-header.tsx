"use client";

import Link from "next/link";
import { Github } from "lucide-react";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import LanguageSelect from "@/components/language-select";
import { useTranslation } from "@/contexts/translation-context";
import { useAdminHomeHref } from "@/lib/use-admin-home-href";

export function SiteHeader() {
  const { t } = useTranslation();
  const logoHref = useAdminHomeHref();

  const scrollHomeToTop = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (logoHref !== "/" || window.location.pathname !== "/") return;
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href={logoHref}
          onClick={scrollHomeToTop}
          className="flex shrink-0 items-center gap-2 text-base font-semibold tracking-tight transition-opacity hover:opacity-80"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            H
          </span>
          <span>FindHackEU</span>
        </Link>
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
          <Separator orientation="vertical" className="mx-1 h-6" />
          <ThemeSwitcher compact />
          <LanguageSelect />
        </div>
      </div>
    </header>
  );
}
