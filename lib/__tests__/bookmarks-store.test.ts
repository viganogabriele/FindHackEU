// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  filterBookmarkedHackathons,
  useBookmarksStore,
} from "@/lib/bookmarks-store";

describe("bookmarks store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    useBookmarksStore.setState({ bookmarkedIds: [] });
    localStorage.clear();
  });

  it("toggles a bookmark on and off", () => {
    useBookmarksStore.getState().toggleBookmark("hackathon-1");
    expect(useBookmarksStore.getState().bookmarkedIds).toEqual(["hackathon-1"]);
    expect(useBookmarksStore.getState().hasBookmark("hackathon-1")).toBe(true);

    useBookmarksStore.getState().toggleBookmark("hackathon-1");
    expect(useBookmarksStore.getState().bookmarkedIds).toEqual([]);
  });

  it("persists bookmarked ids through the configured storage", () => {
    useBookmarksStore.getState().toggleBookmark("hackathon-2");
    expect(JSON.parse(localStorage.getItem("hacktrack-bookmarks")!)).toEqual({
      state: { bookmarkedIds: ["hackathon-2"] },
      version: 0,
    });
  });

  it("keeps working when localStorage is unavailable", () => {
    const localStorageGetter = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    useBookmarksStore.getState().toggleBookmark("hackathon-3");

    expect(localStorageGetter).toHaveBeenCalled();
    expect(useBookmarksStore.getState().hasBookmark("hackathon-3")).toBe(true);
  });
});

describe("filterBookmarkedHackathons", () => {
  it("keeps only rows whose ids are bookmarked", () => {
    const hackathons = [{ id: "one" }, { id: "two" }, { id: "three" }];
    expect(filterBookmarkedHackathons(hackathons, ["three", "one"])).toEqual([
      { id: "one" },
      { id: "three" },
    ]);
  });
});
