"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

/**
 * Browser-side Supabase client for the admin-page sign-in flow
 * (issue #67). Only used by the client components that call
 * `auth.signInWithOAuth({ provider: "google" })` / `auth.signOut()` - all
 * read/write access to hackathon data still goes through the existing
 * server-side `supabase`/`supabaseAdmin` clients in `lib/supabase.ts`.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
