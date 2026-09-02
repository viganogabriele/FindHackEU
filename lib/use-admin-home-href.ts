"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/services/supabase-auth-browser";

/**
 * Header logo href (issue #7). Regular visitors always get "/" - the normal
 * "go home" behavior, with zero admin-related work or flicker, in every
 * environment including production. Only in a dev-only context
 * (`NODE_ENV !== "production"`, matching the existing `/admin` route gate)
 * do we check for an existing Supabase Auth session client-side and, if one
 * exists, point the logo at `/admin` instead - this is a UX convenience, not
 * a security boundary; `requireAdminAuth()` on the server remains the real
 * gate for admin actions.
 */
export function useAdminHomeHref(): string {
  const [href, setHref] = useState("/");

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    let cancelled = false;
    createSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled && data.session) {
          setHref("/admin");
        }
      })
      .catch(() => {
        // No session available - keep the default "/" href.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return href;
}
