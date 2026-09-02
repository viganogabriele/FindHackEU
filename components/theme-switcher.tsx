"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Moon, Palette, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeStore, AVAILABLE_THEMES } from "@/lib/theme-store";
import { getThemePreviewColors } from "@/lib/theme-utils";
import { useTranslation } from "@/contexts/translation-context";

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const { styles, currentMode, setThemeById, toggleMode } = useThemeStore();

  // Hydration-safe "have we mounted on the client" check, without the
  // extra render + setState-in-effect that `useState`/`useEffect` would
  // need for this (flagged by react-hooks/set-state-in-effect - a
  // client/server-snapshot useSyncExternalStore is the standard way to
  // express "true only after hydration" instead).
  const hydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const currentTheme = AVAILABLE_THEMES.find(
    (theme) => JSON.stringify(theme.styles) === JSON.stringify(styles),
  );

  const previewColors =
    hydrated && currentTheme
      ? getThemePreviewColors(currentTheme.styles[currentMode])
      : { primary: "transparent", accent: "transparent" };
  const { t } = useTranslation();

  const themePicker = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={compact ? "ghost" : "outline"}
          size={compact ? "icon" : "default"}
          role="combobox"
          aria-expanded={open}
          aria-label={compact ? t("theme") : undefined}
          title={compact ? t("theme") : undefined}
          className={compact ? "size-9" : "w-full justify-between"}
        >
          {compact ? (
            <Palette className="size-4" aria-hidden="true" />
          ) : (
            <>
              <span className="flex items-center gap-2">
                <span className="flex gap-1" aria-hidden="true">
                  <span
                    className="size-4 rounded border"
                    style={{ backgroundColor: previewColors.primary }}
                  />
                  <span
                    className="size-4 rounded border"
                    style={{ backgroundColor: previewColors.accent }}
                  />
                </span>
                {hydrated
                  ? (currentTheme?.name ?? t("theme.selectPlaceholder"))
                  : t("theme.loading")}
              </span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      {/* Not a hard 300px: that leaves 10px of slack on a 320px-wide
          screen, and none once the viewport is narrower. */}
      <PopoverContent
        className="w-[min(300px,calc(100vw-2rem))] p-0"
        align="end"
      >
        <Command>
          <CommandInput placeholder={t("theme.searchPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("theme.noThemeFound")}</CommandEmpty>
            <CommandGroup>
              {AVAILABLE_THEMES.map((theme) => {
                const isSelected = currentTheme?.id === theme.id;
                const colors = getThemePreviewColors(theme.styles[currentMode]);

                return (
                  <CommandItem
                    key={theme.id}
                    value={theme.id}
                    onSelect={() => {
                      setThemeById(theme.id);
                      setOpen(false);
                    }}
                  >
                    <div className="flex flex-1 items-center gap-3">
                      <Check
                        className={cn(
                          "size-4",
                          isSelected ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex gap-1" aria-hidden="true">
                        <div
                          className="size-4 rounded border"
                          style={{ backgroundColor: colors.primary }}
                        />
                        <div
                          className="size-4 rounded border"
                          style={{ backgroundColor: colors.accent }}
                        />
                      </div>
                      <span className="font-medium">{theme.name}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={toggleMode}
          aria-label={
            currentMode === "light"
              ? t("theme.switchToDark")
              : t("theme.switchToLight")
          }
          title={
            currentMode === "light"
              ? t("theme.switchToDark")
              : t("theme.switchToLight")
          }
        >
          {currentMode === "light" ? (
            <Sun className="size-4" />
          ) : (
            <Moon className="size-4" />
          )}
        </Button>
        {themePicker}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header con icona e Toggle Dark/Light */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4" />
          <h2 className="font-semibold">{t("theme")}</h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 transition-colors duration-100"
          onClick={toggleMode}
          aria-label={
            currentMode === "light"
              ? t("theme.switchToDark")
              : t("theme.switchToLight")
          }
          title={
            currentMode === "light"
              ? t("theme.switchToDark")
              : t("theme.switchToLight")
          }
        >
          {currentMode === "light" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>

      {themePicker}
    </div>
  );
}
