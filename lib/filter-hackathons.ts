import type { FilterState } from "@/contexts/filter-context";
import { looksLikeForeignLanguage } from "@/lib/detect-non-english";
import {
  hackathonMatchesLocationFilter,
  hackathonMatchesRadiusFilter,
} from "@/lib/location-filter";
import { filterBookmarkedHackathons } from "@/lib/bookmarks-store";
import { getEventType } from "@/lib/event-type";
import type { Hackathon } from "@/types/hackathon";

/** Last instant of `date`'s local calendar day. */
function endOfDay(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function filterAndSortHackathons(
  hackathons: Hackathon[],
  filters: FilterState,
  locale: string,
  bookmarkedIds: readonly string[] = [],
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
      filters.eventType !== "all" &&
      getEventType(hackathon.name) !== filters.eventType
    ) {
      return false;
    }

    if (
      !filters.includeNonEnglish &&
      looksLikeForeignLanguage(hackathon.name, locale)
    ) {
      return false;
    }

    if (!filters.includeOnline && hackathon.location_type === "online") {
      return false;
    }

    if (filters.dateRange?.from || filters.dateRange?.to) {
      const hackathonDate = new Date(hackathon.date_start);
      if (filters.dateRange.from && hackathonDate < filters.dateRange.from) {
        return false;
      }
      // `to` comes from react-day-picker as that day at local midnight, so
      // comparing against it directly excluded every event on the last day
      // the visitor picked - a range ending "10 Oct" dropped a hackathon
      // starting 10 Oct at 09:00. Both ends of a picked range are
      // inclusive in the UI, so the upper bound is the end of that day.
      if (
        filters.dateRange.to &&
        hackathonDate > endOfDay(filters.dateRange.to)
      ) {
        return false;
      }
    }

    return true;
  });

  const bookmarked = filters.showBookmarked
    ? filterBookmarkedHackathons(filtered, bookmarkedIds)
    : filtered;

  return [...bookmarked].sort((a, b) => {
    const dateA = new Date(a.date_start).getTime();
    const dateB = new Date(b.date_start).getTime();
    return filters.sort === "asc" ? dateA - dateB : dateB - dateA;
  });
}
