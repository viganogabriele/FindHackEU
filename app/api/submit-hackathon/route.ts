import { NextResponse } from "next/server";
import {
  submitManualCandidate,
  type ManualCandidateInput,
  type SubmitManualCandidateResult,
} from "@/lib/services/submit-manual-candidate";
import { createRateLimiter, getClientKey } from "@/lib/http/rate-limit";

const RATE_LIMIT_PER_HOUR = 10;
const rateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: RATE_LIMIT_PER_HOUR,
});

function resultResponse(result: SubmitManualCandidateResult) {
  if (result.outcome === "created") {
    return NextResponse.json(result, { status: 201 });
  }
  if (result.outcome === "error") {
    console.error("Public hackathon submission failed:", result.message);
    return NextResponse.json(
      {
        outcome: "error",
        message: "Unable to save the suggestion. Please try again later.",
      },
      { status: 500 },
    );
  }
  return NextResponse.json(result, {
    status: 400,
  });
}

export async function POST(request: Request) {
  if (!rateLimiter.check(getClientKey(request)).allowed) {
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
