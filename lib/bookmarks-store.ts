import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";
import { useEffect } from "react";

interface BookmarksState {
  bookmarkedIds: string[];
  toggleBookmark: (id: string) => void;
  hasBookmark: (id: string) => boolean;
}

const unavailableStorage: Storage = {
  get length() {
    return 0;
  },
  clear() {},
  getItem() {
    return null;
  },
  key() {
    return null;
  },
  removeItem() {},
  setItem() {},
};

/** A storage adapter that keeps bookmark actions usable when storage is blocked. */
const safeStorage = (): Storage => {
  try {
    const storage = window.localStorage;
    const probeKey = "__hacktrack_bookmarks_probe__";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return unavailableStorage;
  }
};

/** Resolve browser storage per operation so blocked storage is handled lazily. */
const lazyStorage: StateStorage = {
  getItem: (name) => safeStorage().getItem(name),
  setItem: (name, value) => safeStorage().setItem(name, value),
  removeItem: (name) => safeStorage().removeItem(name),
};

export const useBookmarksStore = create<BookmarksState>()(
  persist(
    (set, get) => ({
      bookmarkedIds: [],
      toggleBookmark: (id) =>
        set((state) => ({
          bookmarkedIds: state.bookmarkedIds.includes(id)
            ? state.bookmarkedIds.filter((bookmarkId) => bookmarkId !== id)
            : [...state.bookmarkedIds, id],
        })),
      hasBookmark: (id) => get().bookmarkedIds.includes(id),
    }),
    {
      name: "hacktrack-bookmarks",
      storage: createJSONStorage(() => lazyStorage),
      partialize: (state) => ({ bookmarkedIds: state.bookmarkedIds }),
      skipHydration: true,
    },
  ),
);

/** Rehydrate only after mount so SSR and the first client render stay equal. */
export function useBookmarksHydration() {
  useEffect(() => {
    void useBookmarksStore.persist.rehydrate();
  }, []);
}

export function filterBookmarkedHackathons<T extends { id: string }>(
  hackathons: T[],
  bookmarkedIds: readonly string[],
): T[] {
  const ids = new Set(bookmarkedIds);
  return hackathons.filter((hackathon) => ids.has(hackathon.id));
}
