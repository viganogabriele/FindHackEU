export const SUPABASE_SESSION_HEADERS = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
} as const;

export function applySupabaseSessionHeaders(
  target: Headers,
  headers: Record<string, string> = SUPABASE_SESSION_HEADERS,
): void {
  Object.entries(headers).forEach(([name, value]) => {
    target.set(name, value);
  });
}
