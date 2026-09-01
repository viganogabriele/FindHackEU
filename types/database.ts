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
        };
      };
    };
  };
}
