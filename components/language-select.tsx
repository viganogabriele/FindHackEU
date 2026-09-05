"use client";

import React from "react";
import { useTranslation } from "@/contexts/translation-context";
import ReactCountryFlag from "react-country-flag";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const languages = [
  { code: "en", name: "English", flag: "GB" },
  { code: "it", name: "Italiano", flag: "IT" },
  { code: "de", name: "Deutsch", flag: "DE" },
  { code: "es", name: "Español", flag: "ES" },
  { code: "fr", name: "Français", flag: "FR" },
  { code: "nl", name: "Nederlands", flag: "NL" },
  { code: "pt", name: "Português", flag: "PT" },
  { code: "pl", name: "Polski", flag: "PL" },
  { code: "ro", name: "Română", flag: "RO" },
  { code: "sv", name: "Svenska", flag: "SE" },
] as const;

export default function LanguageSelect({ className }: { className?: string }) {
  const { locale, setLocale } = useTranslation();
  const currentLanguage =
    languages.find((lang) => lang.code === locale) ?? languages[0];

  return (
    <div className={className}>
      <Select value={locale} onValueChange={(v) => setLocale(v)}>
        <SelectTrigger
          size="sm"
          aria-label={currentLanguage.name}
          className="w-auto rounded-full border-0 bg-muted/60 px-2 shadow-none hover:bg-accent [&>svg]:hidden"
        >
          <SelectValue placeholder={locale === "en" ? "EN" : "IT"}>
            <span className="flex items-center gap-1.5">
              <ReactCountryFlag
                countryCode={currentLanguage.flag}
                svg
                style={{ width: "1.2em" }}
              />
              <span className="text-xs font-semibold tracking-wide">
                {currentLanguage.code.toUpperCase()}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {languages.map((lang) => (
            <SelectItem key={lang.code} value={lang.code}>
              <span className="flex items-center gap-2">
                <ReactCountryFlag
                  countryCode={lang.flag}
                  svg
                  style={{ width: "1.2em" }}
                />
                <span>{lang.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
