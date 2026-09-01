import type { HackathonTopic } from "@/lib/constants/topics";

export interface Database {
  public: {
    Tables: {
      hackathons: {
        Row: {
          id: string;
          name: string;
          // location: REMOVED - Use city + country_code instead
          city: string | null;
          country_code: string | null;
          // Nullable until the coordinate backfill has run for historical
          // rows. New city-based pipeline rows are populated when possible.
          latitude: number | null;
          longitude: number | null;
          // Added for issue #21 (extend the location model beyond
          // city/country): distinguishes physical/online/hybrid/unannounced
          // events so the frontend can render something more useful than a
          // blank location for a non-physical or not-yet-announced event.
          location_type: "physical" | "online" | "hybrid" | "tbd";
          venue: string | null;
          date_start: string;
          date_end: string | null;
          topics: HackathonTopic[] | null;
          notes: string | null;
          preview_image_url: string | null;
          url: string;
          source: string;
          status: "upcoming" | "past" | "estimated";
          created_at: string;
          updated_at: string;
          notified: boolean;
          is_new: boolean;
          // Added for issue #72: soft-delete a published hackathon (manual
          // "Archive" action or the automatic retention sweep) instead of a
          // hard DELETE - null means "not archived", the normal case. The
          // public API (app/api/hackathons/route.ts) excludes any row where
          // this is set.
          archived_at: string | null;
          archived_reason: string | null;
          // Added for issue #102: independent moderation lifecycle from
          // issue #72's archived_at (date-based retention). Every published
          // hackathon, regardless of origin, can be moved between these
          // three states from the admin UI - 'approved' is the default,
          // matching every pre-existing row's implicit status. The public
          // API only returns 'approved' rows (in addition to the existing
          // archived_at is null filter).
          moderation_state: "approved" | "pending" | "rejected";
          // Set by issue #103's published-row editor. A non-null value tells
          // the main source-sync pipeline to preserve the row's manually
          // corrected scraper-owned fields.
          manually_edited_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          // location: REMOVED - Use city + country_code instead
          city?: string | null;
          country_code?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          // Optional on insert: the DB default ('tbd') covers callers that
          // don't have a signal yet.
          location_type?: "physical" | "online" | "hybrid" | "tbd";
          venue?: string | null;
          date_start: string;
          date_end?: string | null;
          topics?: HackathonTopic[] | null;
          notes?: string | null;
          preview_image_url?: string | null;
          url: string;
          source?: string;
          status?: "upcoming" | "past" | "estimated";
          created_at?: string;
          updated_at?: string;
          notified?: boolean;
          is_new?: boolean;
          archived_at?: string | null;
          archived_reason?: string | null;
          // Optional on insert: the DB default ('approved') matches current
          // implicit behavior for every caller that doesn't have an
          // opinion (the main scraping pipeline, promote-candidate.ts).
          moderation_state?: "approved" | "pending" | "rejected";
          manually_edited_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          // location: REMOVED - Use city + country_code instead
          city?: string | null;
          country_code?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          location_type?: "physical" | "online" | "hybrid" | "tbd";
          venue?: string | null;
          date_start?: string;
          date_end?: string | null;
          topics?: HackathonTopic[] | null;
          notes?: string | null;
          preview_image_url?: string | null;
          url?: string;
          source?: string;
          status?: "upcoming" | "past" | "estimated";
          created_at?: string;
          updated_at?: string;
          notified?: boolean;
          is_new?: boolean;
          archived_at?: string | null;
          archived_reason?: string | null;
          moderation_state?: "approved" | "pending" | "rejected";
          manually_edited_at?: string | null;
        };
      };
      hackathon_candidates: {
        Row: {
          id: string;
          name: string;
          city: string | null;
          country_code: string | null;
          date_start: string | null;
          date_end: string | null;
          url: string;
          query: string;
          search_provider: string;
          extraction_method: "jsonld-event" | "og-meta" | "text-fallback";
          raw_snippet: string | null;
          status: "pending" | "approved" | "rejected";
          reviewed_at: string | null;
          reviewer_note: string | null;
          promoted_at: string | null;
          promoted_hackathon_id: string | null;
          created_at: string;
          // Set when a lower-confidence tier (Open Graph) disagrees with
          // the winning JSON-LD extraction tier - see issue #15 and
          // lib/search/extract-event-evidence.ts's has_conflict comment.
          has_conflict: boolean;
          // Distinct from `search_provider` (issue #13's own acceptance
          // criteria expect a literal "web-search" value here) -
          // "web-search" for a discovered candidate, "manual" for a
          // hand-submitted URL (see submit-manual-candidate.ts).
          source: string;
          // Explicitly chosen by a submitter (manual submission form) or
          // left null for a web-search-discovered candidate, which falls
          // back to auto-extraction from `name` at promotion time - see
          // lib/services/promote-candidate.ts.
          topics: HackathonTopic[] | null;
        };
        Insert: {
          id?: string;
          name: string;
          city?: string | null;
          country_code?: string | null;
          date_start?: string | null;
          date_end?: string | null;
          url: string;
          query: string;
          search_provider: string;
          extraction_method: "jsonld-event" | "og-meta" | "text-fallback";
          raw_snippet?: string | null;
          status?: "pending" | "approved" | "rejected";
          reviewed_at?: string | null;
          reviewer_note?: string | null;
          promoted_at?: string | null;
          promoted_hackathon_id?: string | null;
          created_at?: string;
          has_conflict?: boolean;
          source?: string;
          topics?: HackathonTopic[] | null;
        };
        Update: {
          id?: string;
          name?: string;
          city?: string | null;
          country_code?: string | null;
          date_start?: string | null;
          date_end?: string | null;
          url?: string;
          query?: string;
          search_provider?: string;
          extraction_method?: "jsonld-event" | "og-meta" | "text-fallback";
          raw_snippet?: string | null;
          status?: "pending" | "approved" | "rejected";
          reviewed_at?: string | null;
          reviewer_note?: string | null;
          promoted_at?: string | null;
          promoted_hackathon_id?: string | null;
          created_at?: string;
          has_conflict?: boolean;
          source?: string;
          topics?: HackathonTopic[] | null;
        };
      };
      update_runs: {
        Row: {
          id: string;
          started_at: string;
          finished_at: string | null;
          status: "running" | "success" | "failed";
          test_mode: boolean;
          sources: Record<string, unknown> | null;
          parsed_count: number | null;
          inserted_count: number | null;
          updated_count: number | null;
          duplicates_removed: number | null;
          degraded: boolean | null;
          error: string | null;
        };
        Insert: {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          status?: "running" | "success" | "failed";
          test_mode?: boolean;
          sources?: Record<string, unknown> | null;
          parsed_count?: number | null;
          inserted_count?: number | null;
          updated_count?: number | null;
          duplicates_removed?: number | null;
          degraded?: boolean | null;
          error?: string | null;
        };
        Update: {
          id?: string;
          started_at?: string;
          finished_at?: string | null;
          status?: "running" | "success" | "failed";
          test_mode?: boolean;
          sources?: Record<string, unknown> | null;
          parsed_count?: number | null;
          inserted_count?: number | null;
          updated_count?: number | null;
          duplicates_removed?: number | null;
          degraded?: boolean | null;
          error?: string | null;
        };
      };
      geocode_cache: {
        Row: {
          query: string;
          latitude: number;
          longitude: number;
          country_code: string | null;
          created_at: string;
        };
        Insert: {
          query: string;
          latitude: number;
          longitude: number;
          country_code?: string | null;
          created_at?: string;
        };
        Update: {
          query?: string;
          latitude?: number;
          longitude?: number;
          country_code?: string | null;
          created_at?: string;
        };
      };
    };
  };
}
