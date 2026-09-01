import { NextResponse } from "next/server";
import {
  submitManualCandidate,
  type ManualCandidateInput,
  type SubmitManualCandidateResult,
} from "@/lib/services/submit-manual-candidate";

const RATE_LIMIT_PER_HOUR = 10;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function getClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded
    ? forwarded.split(",").pop()?.trim()
    : request.headers.get("x-real-ip");
  return ip || "unknown";
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const current = rateLimitMap.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return false;
  }

  if (current.count >= RATE_LIMIT_PER_HOUR) return true;
  current.count++;
  return false;
}

function resultResponse(result: SubmitManualCandidateResult) {
  if (result.outcome === "created") {
    return NextResponse.json(result, { status: 201 });
  }
  return NextResponse.json(result, {
    status: result.outcome === "invalid" ? 400 : 500,
  });
}

export async function POST(request: Request) {
  if (isRateLimited(getClientKey(request))) {
    return NextResponse.json(
      {
        outcome: "error",
        message: "Too many submissions. Please try again later.",
      },
      { status: 429 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { outcome: "invalid", message: "A form submission is required." },
      { status: 400 },
    );
  }

  const input: ManualCandidateInput = {
    url: String(formData.get("url") ?? ""),
    name: String(formData.get("name") ?? ""),
    city: String(formData.get("city") ?? ""),
    countryCode: String(formData.get("countryCode") ?? ""),
    dateStart: String(formData.get("dateStart") ?? ""),
    topics: formData.getAll("topics").map(String),
  };

  return resultResponse(await submitManualCandidate(input));
}
