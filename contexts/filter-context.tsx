"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { DateRange } from "react-day-picker";
import type { HackathonTopic } from "@/lib/constants/topics";
import type { RadiusFilter } from "@/lib/location-filter";

export interface FilterState {
  search: string;
  locations: string[];
  radius: RadiusFilter | null;
  topics: HackathonTopic[];
  dateRange: DateRange | undefined;
  status: "upcoming" | "past";
  sort: "asc" | "desc";
  // Whether to include hackathons whose title looks like a language other
  // than English or the active site locale (see lib/detect-non-english.ts).
  // Defaults to false so the active locale and English are the default set.
  includeNonEnglish: boolean;
  // Whether to include hackathons whose location_type is "online". Defaults
  // to true (unlike includeNonEnglish's false default) so this new filter
  // doesn't hide anything that was previously always shown - it's an
  // opt-out, not an opt-in.
  includeOnline: boolean;
  showBookmarked: boolean;
}

export interface FilterContextType {
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  updateFilter: <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => void;
  clearFilters: () => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

const initialFilters: FilterState = {
  search: "",
  locations: [],
  radius: null,
  topics: [],
  dateRange: undefined,
  status: "upcoming",
  sort: "asc",
  includeNonEnglish: false,
  includeOnline: true,
  showBookmarked: false,
};

export function retainAvailableLocations(
  selectedLocations: string[],
  availableLocations: string[],
) {
  const available = new Set(availableLocations);
  return selectedLocations.filter((location) => available.has(location));
}

export function FilterProvider({
  children,
  locationOptionsByStatus = { upcoming: [], past: [] },
}: {
  children: ReactNode;
  locationOptionsByStatus?: Record<FilterState["status"], string[]>;
}) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  const updateFilter = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => {
    setFilters((prev) => {
      if (key === "status") {
        const status = value as FilterState["status"];
        return {
          ...prev,
          status,
          locations: retainAvailableLocations(
            prev.locations,
            locationOptionsByStatus[status],
          ),
        };
      }
      return { ...prev, [key]: value };
    });
  };

  const clearFilters = () => {
    setFilters({
      ...initialFilters,
      status: filters.status,
      sort: filters.sort,
    });
  };

  return (
    <FilterContext.Provider
      value={{
        filters,
        setFilters,
        updateFilter,
        clearFilters,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (context === undefined) {
    throw new Error("useFilters must be used within a FilterProvider");
  }
  return context;
}
