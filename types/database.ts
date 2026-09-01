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
          url: string;
          source: string;
          status: "upcoming" | "past" | "estimated";
          created_at: string;
          updated_at: string;
          notified: boolean;
          is_new: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          // location: REMOVED - Use city + country_code instead
          city?: string | null;
          country_code?: string | null;
          // Optional on insert: the DB default ('tbd') covers callers that
          // don't have a signal yet.
          location_type?: "physical" | "online" | "hybrid" | "tbd";
          venue?: string | null;
          date_start: string;
          date_end?: string | null;
          topics?: HackathonTopic[] | null;
          notes?: string | null;
          url: string;
          source?: string;
          status?: "upcoming" | "past" | "estimated";
          created_at?: string;
          updated_at?: string;
          notified?: boolean;
          is_new?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          // location: REMOVED - Use city + country_code instead
          city?: string | null;
          country_code?: string | null;
          location_type?: "physical" | "online" | "hybrid" | "tbd";
          venue?: string | null;
          date_start?: string;
          date_end?: string | null;
          topics?: HackathonTopic[] | null;
          notes?: string | null;
          url?: string;
          source?: string;
          status?: "upcoming" | "past" | "estimated";
          created_at?: string;
          updated_at?: string;
          notified?: boolean;
          is_new?: boolean;
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
    };
  };
}
