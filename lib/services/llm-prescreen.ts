import { fetchWithRetry } from "@/lib/http/fetch-with-retry";
import type { AutoPublishBlocker } from "@/lib/discovery/web-search-candidates";
import type { Database } from "@/types/database";

type CandidateRow = Database["public"]["Tables"]["hackathon_candidates"]["Row"];

/**
 * A single approve/reject decision pulled from `hackathon_candidates`,
 * used as few-shot context. Only the fields the prompt actually shows are
 * carried - not the full row - so a caller building this from a Supabase
 * query only needs a `select()` of these columns.
 */
export interface PrescreenExample {
  name: string;
  status: "approved" | "rejected";
  reviewer_note: string | null;
}

/** The subset of a candidate row the prompt needs to describe it. */
export type PrescreenCandidateInput = Pick<
  CandidateRow,
  "name" | "raw_snippet" | "extraction_method" | "query" | "has_conflict"
> & {
  blockers: AutoPublishBlocker[];
};

export type PrescreenVerdict = "likely-valid" | "caution" | "unclear";

export interface PrescreenSuggestion {
  verdict: PrescreenVerdict;
  rationale: string;
}

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Default request timeout (issue #17). Deliberately short - this call
 * gates page render of the Pending tab, so a slow/hanging Gemini response
 * must never noticeably delay the admin from seeing the queue. A timeout
 * here degrades to "no suggestion", not an error.
 */
const DEFAULT_TIMEOUT_MS = 6_000;

/**
 * Builds the Gemini prompt for one candidate: a short instruction, a
 * handful of real few-shot approve/reject examples (with their
 * `reviewer_note`, when one exists), and the candidate's own extracted
 * evidence plus its existing structured auto-publish-blocker tags (issue
 * #104) - reusing signal the codebase already computes rather than asking
 * the model to re-derive it. Pure function so prompt shape is directly
 * testable without a network call.
 */
export function buildPrescreenPrompt(
  candidate: PrescreenCandidateInput,
  examples: PrescreenExample[],
): string {
  const exampleLines = examples.length
    ? examples
        .map((example, index) => {
          const note = example.reviewer_note
            ? ` Reviewer note: "${example.reviewer_note}"`
            : "";
          return `${index + 1}. [${example.status.toUpperCase()}] "${example.name}"${note}`;
        })
        .join("\n")
    : "(no prior decisions available yet)";

  const blockerLine = candidate.blockers.length
    ? candidate.blockers.map((b) => b.label).join(", ")
    : "none";

  const snippet = candidate.raw_snippet
    ? candidate.raw_snippet.slice(0, 1000)
    : "(no extracted text)";

  return `You are helping a human moderator pre-screen a candidate hackathon event scraped from the web, before it is published on a European hackathon listing site. You NEVER approve or reject anything yourself - you only suggest a verdict and a short rationale for a human to consider.

Recent real moderator decisions (for calibration only, not exhaustive):
${exampleLines}

Now evaluate this new candidate:
- Name: "${candidate.name}"
- Found via search query: "${candidate.query}"
- Evidence extraction method: ${candidate.extraction_method}
- Page has conflicting title data: ${candidate.has_conflict ? "yes" : "no"}
- Existing automated blocker tags: ${blockerLine}
- Extracted page text/snippet: ${snippet}

Respond with STRICT JSON only, no markdown fences, in exactly this shape:
{"verdict": "likely-valid" | "caution" | "unclear", "rationale": "one or two sentences explaining why"}`;
}

/**
 * Parses a raw Gemini text response into a `PrescreenSuggestion`. Tolerant
 * of markdown code fences (some Gemini responses wrap JSON in \`\`\`json
 * ... \`\`\` despite the prompt's "no markdown fences" instruction) and
 * whitespace. Returns `null` (not a throw) for anything that doesn't
 * parse into the expected shape - this keeps the degradation path in
 * `prescreenCandidate` a single, uniform try/catch.
 */
export function parsePrescreenResponse(
  raw: string,
): PrescreenSuggestion | null {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }

  const { verdict, rationale } = parsed as Record<string, unknown>;

  if (
    (verdict !== "likely-valid" &&
      verdict !== "caution" &&
      verdict !== "unclear") ||
    typeof rationale !== "string" ||
    rationale.trim().length === 0
  ) {
    return null;
  }

  return { verdict, rationale: rationale.trim() };
}

function extractGeminiText(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const candidates = (data as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const content = (candidates[0] as Record<string, unknown> | undefined)
    ?.content;
  if (typeof content !== "object" || content === null) return null;

  const parts = (content as Record<string, unknown>).parts;
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const text = (parts[0] as Record<string, unknown> | undefined)?.text;
  return typeof text === "string" ? text : null;
}

/**
 * Calls the Gemini Flash `generateContent` REST endpoint directly (no SDK
 * - a plain JSON POST is straightforward and this is the only call site,
 * see CLAUDE.md's issue #17 write-up) and parses the response into a
 * suggestion. This is a best-effort moderation aid, not a pipeline stage:
 * every failure mode - missing key, network error, timeout, malformed
 * response - resolves to `null` rather than throwing, so a caller can
 * `await` it directly without its own try/catch and the Pending tab always
 * renders exactly as it does today when nothing is configured or Gemini is
 * unavailable.
 */
export async function prescreenCandidate(
  candidate: PrescreenCandidateInput,
  examples: PrescreenExample[],
  {
    apiKey = process.env.GEMINI_API_KEY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: { apiKey?: string; timeoutMs?: number } = {},
): Promise<PrescreenSuggestion | null> {
  if (!apiKey) {
    return null;
  }

  try {
    const prompt = buildPrescreenPrompt(candidate, examples);

    const response = await fetchWithRetry(
      `${GEMINI_ENDPOINT}?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 200,
          },
        }),
      },
      { timeoutMs, retries: 0 },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const text = extractGeminiText(data);
    if (!text) return null;

    return parsePrescreenResponse(text);
  } catch (error) {
    console.warn(
      `LLM pre-screening failed for candidate "${candidate.name}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}
