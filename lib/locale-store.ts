import { create } from "zustand";
import { persist } from "zustand/middleware";

type LocaleState = {
  locale: string;
  setLocale: (l: string) => void;
};

// Real hydration mismatch bug (found via a live report): the store used to
// read localStorage synchronously while computing its initial state. On
// the server this is always "en" (no window), but on the CLIENT it read
// the visitor's actually-saved locale immediately - before React even
// finished hydrating - so a visitor who had previously picked e.g.
// Italian saw every translated string (starting with ThemeSwitcher's
// "Theme"/"Tema" label) mismatch between server and client markup on
// every load.
//
// Fix: always start at "en" (matching what the server rendered) via
// `skipHydration: true`, then rehydrate from localStorage explicitly in a
// `useEffect` in TranslationProvider (contexts/translation-context.tsx) -
// after the initial hydration pass has already committed, the same way
// ThemeSwitcher's own hydration-safe flag works.
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "en",
      setLocale: (l: string) => set({ locale: l }),
    }),
    {
      name: "locale-storage",
      partialize: (s) => ({ locale: s.locale }),
      skipHydration: true,
    },
  ),
);
