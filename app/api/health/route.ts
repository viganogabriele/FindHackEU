import { NextResponse } from "next/server";

// Keep this endpoint independent from Supabase so it can distinguish app
// reachability from database health without adding a write or a user signal.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
