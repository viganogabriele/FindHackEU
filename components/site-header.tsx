"use client";

import Link from "next/link";
import { Github } from "lucide-react";
import { FaDiscord, FaTelegram, FaXTwitter } from "react-icons/fa6";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import LanguageSelect from "@/components/language-select";
import { useTranslation } from "@/contexts/translation-context";

const socialLinks = [
  {
    href: "https://discord.com/invite/SmygTckVez",
    icon: FaDiscord,
    labelKey: "external.discord",
  },
  {
    href: "https://t.me/hacktrackeu",
    icon: FaTelegram,
    labelKey: "external.telegram",
  },
  {
    href: "https://x.com/hacktrackeu",
    icon: FaXTwitter,
    labelKey: "external.twitter",
  },
  {
    href: "https://github.com/lorenzopalaia/hacktrack-eu",
    icon: Github,
    labelKey: "external.github",
  },
] as const;

export function SiteHeader() {
  const { t } = useTranslation();

  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-base font-semibold tracking-tight">
          HackTrack EU
        </Link>
        <div className="flex items-center gap-1">
          <nav className="flex items-center gap-1" aria-label={t("socials")}>
            {socialLinks.map(({ href, icon: Icon, labelKey }) => (
              <Button
                key={href}
                asChild
                variant="ghost"
                size="icon"
                className="size-9"
              >
                <Link
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t(labelKey)}
                  title={t(labelKey)}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </Link>
              </Button>
            ))}
          </nav>
          <ThemeSwitcher compact />
          <LanguageSelect />
        </div>
      </div>
    </header>
  );
}
