import type { FilterState } from "@/contexts/filter-context";
import { looksLikeForeignLanguage } from "@/lib/detect-non-english";
import {
  hackathonMatchesLocationFilter,
  hackathonMatchesRadiusFilter,
} from "@/lib/location-filter";
import type { Hackathon } from "@/types/hackathon";

export function filterAndSortHackathons(
  hackathons: Hackathon[],
  filters: FilterState,
  locale: string,
) {
  const filtered = hackathons.filter((hackathon) => {
    if (
      filters.search &&
      !hackathon.name.toLowerCase().includes(filters.search.toLowerCase())
    ) {
      return false;
    }

    if (
      !hackathonMatchesLocationFilter(
        hackathon.city,
        hackathon.country_code,
        filters.locations,
      ) ||
      !hackathonMatchesRadiusFilter(
        hackathon.latitude,
        hackathon.longitude,
        filters.radius,
      )
    ) {
      return false;
    }

    if (filters.topics.length > 0) {
      const hackathonTopics = hackathon.topics || [];
      if (!filters.topics.some((topic) => hackathonTopics.includes(topic))) {
        return false;
      }
    }

    if (
      !filters.includeNonEnglish &&
      looksLikeForeignLanguage(hackathon.name, locale)
    ) {
      return false;
    }

    if (filters.dateRange?.from || filters.dateRange?.to) {
      const hackathonDate = new Date(hackathon.date_start);
      if (filters.dateRange.from && hackathonDate < filters.dateRange.from) {
        return false;
      }
      if (filters.dateRange.to && hackathonDate > filters.dateRange.to) {
        return false;
      }
    }

    return true;
  });

  return [...filtered].sort((a, b) => {
    const dateA = new Date(a.date_start).getTime();
    const dateB = new Date(b.date_start).getTime();
    return filters.sort === "asc" ? dateA - dateB : dateB - dateA;
  });
}
