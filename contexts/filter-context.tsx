"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { DateRange } from "react-day-picker";
import type { HackathonTopic } from "@/lib/constants/topics";

export interface FilterState {
  search: string;
  locations: string[];
  topics: HackathonTopic[];
  dateRange: DateRange | undefined;
  status: "upcoming" | "past";
  sort: "asc" | "desc";
  // Whether to include hackathons whose title looks non-English (see
  // lib/detect-non-english.ts and issue #54). Defaults to true so this
  // filter is additive - it never hides anything until a visitor
  // explicitly opts out.
  includeNonEnglish: boolean;
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
  topics: [],
  dateRange: undefined,
  status: "upcoming",
  sort: "asc",
  includeNonEnglish: true,
};

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  const updateFilter = <K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) => {
    setFilters((prev) => {
      // Se stiamo cambiando lo status, resetta anche le locations
      if (key === "status") {
        return { ...prev, [key]: value, locations: [] };
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
