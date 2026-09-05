"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { enGB } from "date-fns/locale";
import {
  CalendarIcon,
  Check,
  ChevronsUpDown,
  Filter,
  FilterX,
  Search,
} from "lucide-react";
import type { HackathonTopic } from "@/lib/constants/topics";
import { EVENT_TYPES, type EventType } from "@/lib/event-type";
import {
  DEFAULT_RADIUS_KM,
  countryCodeFromLocationValue,
  formatCountryLocationLabel,
  formatLocationValueLabel,
  getCityLocationOptionsForCountry,
  isCountryLocationValue,
  narrowCountryToCity,
} from "@/lib/location-filter";
import { cn } from "@/lib/utils";
import { useFilters } from "@/contexts/filter-context";
import { useTranslation } from "@/contexts/translation-context";
import {
  ActiveFilterChips,
  type ActiveFilterChip,
} from "@/components/active-filter-chips";
import { PublicSubmitForm } from "@/components/public-submit-form";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";

// `react-day-picker` is only needed after the visitor opens the date filter.
// A static import here made its ~60 KB gzip chunk part of every home visit,
// even though the enclosing Popover is closed by default.
const Calendar = dynamic(() =>
  import("@/components/ui/calendar").then((module) => module.Calendar),
);

const MIN_RADIUS_KM = 5;
const MAX_RADIUS_KM = 500;
const RADIUS_STEP_KM = 5;

function isGeocodeResponse(
  value: unknown,
): value is { data: { latitude: number; longitude: number } } {
  return Boolean(
    value &&
    typeof value === "object" &&
    "data" in value &&
    value.data &&
    typeof value.data === "object" &&
    "latitude" in value.data &&
    "longitude" in value.data &&
    typeof value.data.latitude === "number" &&
    typeof value.data.longitude === "number",
  );
}

export function FiltersPanel({
  uniqueUpcomingLocations,
  uniquePastLocations,
  uniqueTopics,
  viewToggle,
}: {
  uniqueUpcomingLocations: string[];
  uniquePastLocations: string[];
  uniqueTopics: HackathonTopic[];
  viewToggle?: ReactNode;
}) {
  const { filters, updateFilter, clearFilters } = useFilters();
  const { locale, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const [radiusQuery, setRadiusQuery] = useState(filters.radius?.query ?? "");
  const [radiusLoading, setRadiusLoading] = useState(false);
  const [radiusError, setRadiusError] = useState<string | null>(null);
  const availableLocations =
    filters.status === "upcoming"
      ? uniqueUpcomingLocations
      : uniquePastLocations;
  const locationLabel = (value: string) =>
    formatLocationValueLabel(value, (country) =>
      t("locations.allOf", { country }),
    );
  const languageName =
    new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale;
  const activeCount =
    Number(Boolean(filters.search)) +
    filters.locations.length +
    Number(Boolean(filters.radius)) +
    filters.topics.length +
    filters.eventTypes.length +
    Number(Boolean(filters.dateRange?.from || filters.dateRange?.to)) +
    Number(!filters.includeNonEnglish) +
    Number(!filters.includeOnline) +
    Number(filters.showBookmarked);

  const toggleLocation = (location: string) => {
    updateFilter(
      "locations",
      filters.locations.includes(location)
        ? filters.locations.filter((item) => item !== location)
        : [...filters.locations, location],
    );
  };
  const toggleTopic = (topic: HackathonTopic) => {
    updateFilter(
      "topics",
      filters.topics.includes(topic)
        ? filters.topics.filter((item) => item !== topic)
        : [...filters.topics, topic],
    );
  };
  const toggleEventType = (eventType: EventType) => {
    updateFilter(
      "eventTypes",
      filters.eventTypes.includes(eventType)
        ? filters.eventTypes.filter((item) => item !== eventType)
        : [...filters.eventTypes, eventType],
    );
  };
  const selectCityWithinCountry = (countryLocation: string, city: string) => {
    updateFilter(
      "locations",
      narrowCountryToCity(filters.locations, countryLocation, city),
    );
  };
  const applyRadius = async () => {
    const query = radiusQuery.trim();
    if (query.length < 2) return setRadiusError(t("radius.locationTooShort"));
    setRadiusLoading(true);
    setRadiusError(null);
    try {
      const response = await fetch(
        `/api/geocode?query=${encodeURIComponent(query)}`,
      );
      const body: unknown = await response.json();
      if (!response.ok || !isGeocodeResponse(body)) {
        throw new Error(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : t("radius.lookupFailed"),
        );
      }
      updateFilter("radius", {
        query,
        ...body.data,
        radiusKm: filters.radius?.radiusKm ?? DEFAULT_RADIUS_KM,
      });
    } catch (error) {
      setRadiusError(
        error instanceof Error ? error.message : t("radius.lookupFailed"),
      );
    } finally {
      setRadiusLoading(false);
    }
  };

  const chips: ActiveFilterChip[] = [
    ...(filters.search
      ? [
          {
            id: "search",
            label: filters.search,
            onRemove: () => updateFilter("search", ""),
          },
        ]
      : []),
    ...filters.locations.map((location) => ({
      id: `location-${location}`,
      label: locationLabel(location),
      onRemove: () => toggleLocation(location),
    })),
    ...(filters.radius
      ? [
          {
            id: "radius",
            label: t("radius.active", {
              location: filters.radius.query,
              distance: filters.radius.radiusKm,
            }),
            onRemove: () => updateFilter("radius", null),
          },
        ]
      : []),
    ...filters.topics.map((topic) => ({
      id: `topic-${topic}`,
      label: topic,
      onRemove: () => toggleTopic(topic),
    })),
    ...filters.eventTypes.map((eventType) => ({
      id: `event-type-${eventType}`,
      label: t(`eventType.${eventType}`),
      onRemove: () => toggleEventType(eventType),
    })),
    ...(filters.dateRange?.from
      ? [
          {
            id: "dates",
            label: filters.dateRange.to
              ? `${format(filters.dateRange.from, "dd MMM", { locale: enGB })} – ${format(filters.dateRange.to, "dd MMM", { locale: enGB })}`
              : format(filters.dateRange.from, "dd MMM yyyy", { locale: enGB }),
            onRemove: () => updateFilter("dateRange", undefined),
          },
        ]
      : []),
    ...(!filters.includeNonEnglish
      ? [
          {
            id: "language",
            label: t("filters.nonEnglishHidden"),
            onRemove: () => updateFilter("includeNonEnglish", true),
          },
        ]
      : []),
    ...(!filters.includeOnline
      ? [
          {
            id: "online-hidden",
            label: t("filters.onlineHidden"),
            onRemove: () => updateFilter("includeOnline", true),
          },
        ]
      : []),
    ...(filters.showBookmarked
      ? [
          {
            id: "bookmarked",
            label: t("bookmark.only"),
            onRemove: () => updateFilter("showBookmarked", false),
          },
        ]
      : []),
  ];

  // A plain JSX expression, not a nested function component - declaring
  // this as `function FilterControls() {...}` inside FiltersPanel's body
  // gave it a brand-new identity on every render, so React unmounted and
  // remounted this whole subtree (including the radius <Input>) on every
  // keystroke there (each keystroke updates local state, re-rendering
  // FiltersPanel). That dropped DOM focus mid-remount, which the mobile
  // <Sheet>'s focus trap read as focus leaving the dialog and closed it -
  // found live, 2026-09-02 (typing in the radius field closed the whole
  // filters sheet; typing in the location search didn't, since that one
  // filters its list locally without touching FiltersPanel's own state).
  const filterControls = (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("status")}>
          <Select
            value={filters.status}
            onValueChange={(value: "upcoming" | "past") =>
              updateFilter("status", value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upcoming">{t("status.upcoming")}</SelectItem>
              <SelectItem value="past">{t("status.past")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("sort.byDate")}>
          <Select
            value={filters.sort}
            onValueChange={(value: "asc" | "desc") =>
              updateFilter("sort", value)
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">{t("sort.ascending")}</SelectItem>
              <SelectItem value="desc">{t("sort.descending")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={t("filters.show")}>
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">{t("eventType")}</p>
          <div className="grid grid-cols-2 gap-2">
            {EVENT_TYPES.map((eventType) => (
              <FilterCheck
                key={eventType}
                checked={filters.eventTypes.includes(eventType)}
                onCheckedChange={() => toggleEventType(eventType)}
              >
                {t(`eventType.${eventType}`)}
              </FilterCheck>
            ))}
          </div>
          <div className="border-t pt-2">
            <FilterCheck
              checked={filters.includeNonEnglish}
              onCheckedChange={(checked) =>
                updateFilter("includeNonEnglish", checked)
              }
            >
              {t("filters.includeOtherLanguages", { language: languageName })}
            </FilterCheck>
            <FilterCheck
              checked={filters.includeOnline}
              onCheckedChange={(checked) =>
                updateFilter("includeOnline", checked)
              }
            >
              {t("filters.showOnlineEvents")}
            </FilterCheck>
          </div>
        </div>
      </Field>
      <Field label={t("locations")}>
        {availableLocations.length === 0 ? (
          <p
            className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground"
            role="status"
          >
            {t("locations.noneFound")}
          </p>
        ) : (
          <Popover open={locationOpen} onOpenChange={setLocationOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={locationOpen}
                className="w-full justify-between"
              >
                {filters.locations.length > 0
                  ? `${filters.locations.length} ${t("locations.selected")}`
                  : t("locations.select")}
                <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
              <Command>
                <CommandInput placeholder={t("locations.searchPlaceholder")} />
                <CommandList>
                  <CommandEmpty>{t("locations.noneFound")}</CommandEmpty>
                  <CommandGroup>
                    {availableLocations.map((location) => (
                      <CommandItem
                        key={location}
                        onSelect={() => toggleLocation(location)}
                      >
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            filters.locations.includes(location)
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        {locationLabel(location)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {filters.locations
                    .filter(isCountryLocationValue)
                    .map((countryLocation) => {
                      const countryCode =
                        countryCodeFromLocationValue(countryLocation);
                      const cities = countryCode
                        ? getCityLocationOptionsForCountry(
                            availableLocations,
                            countryCode,
                          )
                        : [];
                      return cities.length ? (
                        <CommandGroup
                          key={countryLocation}
                          heading={t("locations.citiesIn", {
                            country: formatCountryLocationLabel(
                              countryCode!,
                              (country) => country,
                            ),
                          })}
                        >
                          {cities.map((city) => (
                            <CommandItem
                              key={city}
                              onSelect={() =>
                                selectCityWithinCountry(countryLocation, city)
                              }
                            >
                              <Check
                                className={cn(
                                  "mr-2 size-4",
                                  filters.locations.includes(city)
                                    ? "opacity-100"
                                    : "opacity-0",
                                )}
                              />
                              {city}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ) : null;
                    })}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </Field>
      <Field label={t("radius.label")}>
        <div className="flex gap-2">
          <Input
            value={radiusQuery}
            placeholder={t("radius.placeholder")}
            onChange={(event) => {
              setRadiusQuery(event.target.value);
              setRadiusError(null);
              if (filters.radius) updateFilter("radius", null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void applyRadius();
              }
            }}
            aria-describedby={radiusError ? "radius-error" : undefined}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void applyRadius()}
            disabled={radiusLoading}
          >
            {radiusLoading ? t("radius.loading") : t("radius.apply")}
          </Button>
        </div>
        {radiusError && (
          <p
            id="radius-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {radiusError}
          </p>
        )}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <Label>{t("radius.distance")}</Label>
            <output>{filters.radius?.radiusKm ?? DEFAULT_RADIUS_KM} km</output>
          </div>
          <Slider
            min={MIN_RADIUS_KM}
            max={MAX_RADIUS_KM}
            step={RADIUS_STEP_KM}
            value={[filters.radius?.radiusKm ?? DEFAULT_RADIUS_KM]}
            onValueChange={([radiusKm]) => {
              if (filters.radius && radiusKm)
                updateFilter("radius", { ...filters.radius, radiusKm });
            }}
            disabled={!filters.radius}
            aria-label={t("radius.distance")}
          />
        </div>
      </Field>
      <Field label={t("topics")}>
        <Popover open={topicOpen} onOpenChange={setTopicOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={topicOpen}
              className="w-full justify-between"
            >
              {filters.topics.length > 0
                ? `${filters.topics.length} ${t("locations.selected")}`
                : t("topics.select")}
              <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-2">
            <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto">
              {uniqueTopics.map((topic) => (
                <FilterCheck
                  key={topic}
                  checked={filters.topics.includes(topic)}
                  onCheckedChange={() => toggleTopic(topic)}
                >
                  {topic}
                </FilterCheck>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </Field>
      <Field label={t("dates")}>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-start text-left font-normal"
            >
              <CalendarIcon className="mr-2 size-4" />
              {filters.dateRange?.from
                ? filters.dateRange.to
                  ? `${format(filters.dateRange.from, "dd MMM", { locale: enGB })} – ${format(filters.dateRange.to, "dd MMM", { locale: enGB })}`
                  : format(filters.dateRange.from, "dd MMM yyyy", {
                      locale: enGB,
                    })
                : t("dates.select")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              defaultMonth={filters.dateRange?.from}
              selected={filters.dateRange}
              onSelect={(range) => updateFilter("dateRange", range)}
              locale={enGB}
            />
          </PopoverContent>
        </Popover>
      </Field>
    </div>
  );

  return (
    <section className="mb-8 space-y-3" aria-label={t("filters")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-lg flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder={t("search.placeholder")}
            aria-label={t("search")}
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {viewToggle}
          <PublicSubmitForm className="hidden sm:inline-flex" />
          <div className="inline-flex items-center rounded-md border bg-muted/30 p-1">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" className="h-10 gap-2 sm:h-8">
                  <Filter className="size-4" aria-hidden="true" />
                  {t("filters")}
                  {activeCount > 0 && (
                    <span className="grid size-5 place-items-center rounded-full bg-primary text-xs text-primary-foreground">
                      {activeCount}
                    </span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-full overflow-y-auto p-0 sm:max-w-md"
              >
                <SheetHeader className="border-b p-6 text-left">
                  <SheetTitle>{t("filters")}</SheetTitle>
                  <SheetDescription>{t("subtitle")}</SheetDescription>
                </SheetHeader>
                <div className="space-y-6 p-6">
                  {filterControls}
                  <Separator />
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-muted-foreground">
                      {activeCount > 0
                        ? `${activeCount} ${t("locations.selected")}`
                        : t("filters")}
                    </span>
                    {activeCount > 0 && (
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <FilterX className="size-4" aria-hidden="true" />{" "}
                        {t("filters.clearAll")}
                      </Button>
                    )}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
      <ActiveFilterChips chips={chips} />
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function FilterCheck({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="flex min-h-10 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid size-4 shrink-0 place-items-center rounded-sm border",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input bg-background",
        )}
      >
        {checked && <Check className="size-3" />}
      </span>
      <span className="leading-snug">{children}</span>
    </button>
  );
}
