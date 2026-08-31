import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { supabaseAdmin } from "@/lib/supabase";
import { LumaParser } from "@/lib/parsers/luma-parser";
import { LablabParser } from "@/lib/parsers/lablab-parser";
import { ParsedHackathon } from "@/lib/parsers/base-parser";
import type { Provider } from "@/lib/providers/provider.interface";
import {
  mergeHackathonDuplicates,
  areSameHackathon,
} from "@/lib/dedup/dedupe-hackathons";
import { normalizeUrl } from "@/lib/dedup/url-normalizer";
import { fetchAllRows } from "@/lib/services/fetch-all-rows";
import { DiscordBot } from "@/lib/bots/discord-bot";
import { TelegramBot } from "@/lib/bots/telegram-bot";
import { TwitterBot } from "@/lib/bots/twitter-bot";
import { ReadmeUpdater } from "@/lib/services/readme-updater";
import { LocationEnhancementService } from "@/lib/services/location-enhancement-service";
import { MemoryOptimizer } from "@/lib/utils/memory-optimizer";
import { Hackathon } from "@/types/hackathon";
import type { ParseStatus } from "@/lib/providers/provider.interface";

interface SourceResult {
  enabled: boolean;
  success: boolean;
  // Explicit per-provider outcome ("ok" | "partial" | "failed"), alongside
  // `success` above - "partial" still has `success: true` (the data it did
  // get is usable) but should be visible as a degraded run rather than
  // indistinguishable from a fully clean one (found in code review).
  status?: ParseStatus;
  parsed: number;
  error: string | null;
}

export async function POST(request: Request) {
  try {
    // ---------------------------------------------------------
    // Initial diagnostics
    // ---------------------------------------------------------
    MemoryOptimizer.logMemoryUsage("Initial memory");

    // ---------------------------------------------------------
    // Authentication
    // ---------------------------------------------------------
    // Fail closed if CRON_SECRET itself isn't configured, instead of
    // comparing against "Bearer undefined" - a deployer who forgets to set
    // this secret would otherwise accept that literal string as valid
    // authorization (found in code review).
    if (!process.env.CRON_SECRET) {
      console.error("CRON_SECRET is not configured - rejecting all requests.");
      return NextResponse.json(
        { error: "Server misconfiguration" },
        { status: 500 },
      );
    }

    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ---------------------------------------------------------
    // Request mode
    // ---------------------------------------------------------
    const testMode = request.headers.get("x-test-mode") === "true";

    console.log(
      `Starting hackathon update${
        testMode ? " (TEST MODE - no notifications/README)" : ""
      }...`,
    );

    // ---------------------------------------------------------
    // Source configuration
    //
    // Adding a new source means creating a class that implements
    // `Provider` (see lib/providers/provider.interface.ts) and
    // adding an instance to this array - no other change to this
    // orchestrator should be required.
    //
    // LabLab is intentionally disabled for now because its
    // public web surface is protected by Cloudflare and cannot
    // currently be queried reliably server-side.
    // ---------------------------------------------------------
    const providers: Provider[] = [new LumaParser(), new LablabParser()];

    const sourceResults: Record<string, SourceResult> = {};

    for (const provider of providers) {
      sourceResults[provider.name] = {
        enabled: provider.enabled,
        // A disabled source never runs, so it never "fails" - mirrors
        // the previous hardcoded defaults (luma: success false until
        // it runs, lablab: success true since it's a no-op).
        success: !provider.enabled,
        parsed: 0,
        error: null,
      };
    }

    // ---------------------------------------------------------
    // 0. Reset is_new flags
    // ---------------------------------------------------------
    let resetError: string | null = null;

    try {
      const { error } = await supabaseAdmin
        .from("hackathons")
        // @ts-expect-error - Supabase generated types may not include update shape
        .update({ is_new: false })
        .neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) {
        resetError = error.message;
        console.error("Error resetting is_new flags:", error);
      } else {
        console.log("Reset all is_new flags to false");
      }
    } catch (error) {
      resetError =
        error instanceof Error ? error.message : "Failed to reset is_new flags";

      console.error("Error resetting is_new flags:", error);
    }

    // ---------------------------------------------------------
    // 1. Parse sources
    // ---------------------------------------------------------
    const parsedHackathons: ParsedHackathon[] = [];

    for (const provider of providers) {
      if (!provider.enabled) {
        console.log(
          `${provider.name} parser disabled: source is currently unavailable server-side`,
        );
        continue;
      }

      try {
        // Honor the provider's own explicit success/errors instead of
        // inferring success from "did an exception propagate" - a
        // provider that failed every unit of work it attempted (see
        // BaseParser.parse()/DiscoverResult) must be reported as failed
        // even though `parse()` itself resolved normally.
        const result = await provider.parse();

        sourceResults[provider.name].success = result.success;
        sourceResults[provider.name].status = result.status;
        sourceResults[provider.name].parsed = result.count;

        if (result.errors.length > 0) {
          sourceResults[provider.name].error = result.errors.join("; ");
        }

        parsedHackathons.push(...result.hackathons);

        console.log(
          `Parsed ${result.count} hackathons from ${provider.name} (status: ${result.status})`,
        );
      } catch (error) {
        sourceResults[provider.name].success = false;
        sourceResults[provider.name].status = "failed";
        sourceResults[provider.name].error =
          error instanceof Error
            ? error.message
            : `${provider.name} parser failed`;

        console.error(`${provider.name} parser failed:`, error);
      }
    }

    console.log(`Total parsed ${parsedHackathons.length} hackathons`);

    // ---------------------------------------------------------
    // Fail fast only if every enabled source failed.
    //
    // We still continue with any successful source, but GitHub
    // should know that the update was incomplete.
    // ---------------------------------------------------------
    const enabledSources = Object.entries(sourceResults).filter(
      ([, result]) => result.enabled,
    );

    const allEnabledSourcesFailed =
      enabledSources.length > 0 &&
      enabledSources.every(([, result]) => !result.success);

    // ---------------------------------------------------------
    // Memory diagnostics
    // ---------------------------------------------------------
    MemoryOptimizer.logMemoryUsage("After parsing");

    // ---------------------------------------------------------
    // Deduplicate
    // ---------------------------------------------------------
    // Cross-provider dedup: normalized-URL match first, then a fuzzy
    // title+date match (guarded against known location conflicts) as a
    // secondary signal. Recognized duplicates keep their other source URL
    // on the in-memory-only `alternateUrls` field for provenance — see
    // lib/dedup/dedupe-hackathons.ts and issue #22. That field is
    // intentionally NOT written to the database (see the insert mapping
    // below); persisting cross-source provenance is deferred to issue #24.
    const deduplicatedHackathons = mergeHackathonDuplicates(parsedHackathons);

    console.log(
      `After deduplication: ${deduplicatedHackathons.length} hackathons`,
    );

    await MemoryOptimizer.allowGarbageCollection();
    MemoryOptimizer.logMemoryUsage("After deduplication");

    // ---------------------------------------------------------
    // 1.5 Location enhancement
    // ---------------------------------------------------------
    console.log("Starting location enhancement with geocoding...");

    const existingUrlsForLocation =
      await LocationEnhancementService.getExistingUrls(supabaseAdmin);

    console.log(
      `Found ${existingUrlsForLocation.size} existing hackathon URLs in database`,
    );

    const enhancedHackathons =
      await LocationEnhancementService.enhanceLocations(
        deduplicatedHackathons,
        existingUrlsForLocation,
      );

    console.log(
      `After location enhancement: ${enhancedHackathons.length} hackathons`,
    );

    // ---------------------------------------------------------
    // 2. Insert new hackathons, update existing ones
    //
    // A hackathon already stored (matched by normalized URL, see
    // lib/dedup/url-normalizer.ts and issue #22) is no longer only ever
    // skipped — if the source's own data for it changed (date, location,
    // topics, notes, name), the stored row is updated in place instead of
    // silently going stale forever (issue #23).
    // ---------------------------------------------------------
    const newHackathons: Hackathon[] = [];
    const updatedHackathons: Hackathon[] = [];
    // Subset of `updatedHackathons` whose date or location changed - the
    // only kind of update the maintainer decided is notification-worthy
    // (a title/description/topics edit is not, to avoid notification
    // spam). Not yet wired into the Discord/Telegram/Twitter bots, which
    // only know how to announce a brand-new hackathon; that copy/formatting
    // decision is left for a follow-up rather than reusing the "New
    // Hackathon!" message for an update.
    const notableUpdates: Hackathon[] = [];
    // Per-row .update() failures used to be only logged and swallowed, so
    // the run could report success even though some existing records
    // failed to sync (found in code review). Tracked here and surfaced in
    // the response/`degraded` flag instead.
    const updateErrors: string[] = [];
    let insertionError: string | null = null;

    try {
      if (enhancedHackathons.length === 0) {
        console.log("No hackathons available for insertion");
      } else {
        // Fetch every existing row (not filtered by an exact IN() match
        // against the freshly-parsed URLs) and compare on normalized URLs
        // (see lib/dedup/url-normalizer.ts). An exact-match IN() filter
        // would miss a hackathon already stored under a differently
        // formatted URL (www./bare domain, lu.ma/luma.com, tracking
        // params, trailing slash) entirely, since the DB row would never
        // even be fetched (issue #22). Select every field this pipeline
        // can update so each incoming hackathon can be diffed against
        // what's already stored. Paginated (see
        // lib/services/fetch-all-rows.ts) so a table past PostgREST's
        // max_rows doesn't silently drop known rows here - which would
        // both cause duplicate inserts and skip real updates.
        type ExistingRow = {
          id: string;
          url: string;
          name: string;
          city: string | null;
          country_code: string | null;
          date_start: string;
          date_end: string | null;
          topics: string[] | null;
          notes: string | null;
        };

        const existingRowList = await fetchAllRows<ExistingRow>((from, to) =>
          supabaseAdmin
            .from("hackathons")
            .select(
              "id, url, name, city, country_code, date_start, date_end, topics, notes",
            )
            // Stable order (see lib/services/fetch-all-rows.ts) so a
            // concurrent insert during pagination can't shift row
            // positions between pages and cause a row to be skipped or
            // read twice (found in code review).
            .order("id", { ascending: true })
            .range(from, to),
        );

        const existingByNormalizedUrl = new Map<string, ExistingRow>(
          existingRowList.map((row) => [normalizeUrl(row.url), row]),
        );

        // Fallback index for the fuzzy-match pass below: an incoming
        // hackathon whose URL doesn't match any existing row is still
        // checked against every existing row from the same calendar day
        // (see areSameHackathon) before being treated as brand new -
        // otherwise the same event re-listed under a different URL (a
        // provider re-issuing links, or a second provider entirely) would
        // be inserted as a duplicate. The shared fuzzy matcher from issue
        // #22 previously only ran within a single run's own results, never
        // against what's already stored (found in code review).
        const existingRowsByDay = new Map<string, ExistingRow[]>();

        for (const row of existingRowList) {
          const day = row.date_start.split("T")[0];
          const bucket = existingRowsByDay.get(day);

          if (bucket) {
            bucket.push(row);
          } else {
            existingRowsByDay.set(day, [row]);
          }
        }

        function existingRowAsHackathon(row: ExistingRow): ParsedHackathon {
          return {
            name: row.name,
            city: row.city ?? undefined,
            country_code: row.country_code ?? undefined,
            date_start: new Date(row.date_start),
            date_end: row.date_end ? new Date(row.date_end) : undefined,
            url: row.url,
            source: "existing",
          };
        }

        function findFuzzyMatch(
          hackathon: ParsedHackathon,
        ): ExistingRow | undefined {
          const day = hackathon.date_start.toISOString().split("T")[0];
          const candidates = existingRowsByDay.get(day);

          return candidates?.find((row) =>
            areSameHackathon(existingRowAsHackathon(row), hackathon),
          );
        }

        console.log(
          `Found ${existingByNormalizedUrl.size} existing hackathons`,
        );

        const hackathonsToInsert: Array<Record<string, unknown>> = [];
        const hackathonsToUpdate: Array<{
          id: string;
          notable: boolean;
          fields: Record<string, unknown>;
        }> = [];

        // Normalizes either a `Date` (from a freshly-parsed hackathon) or a
        // stored Postgres timestamptz string (e.g. "2026-09-02T00:00:00+00:00")
        // to the same "YYYY-MM-DD" shape, so comparing an incoming value
        // against what's already in the database doesn't flag every row as
        // changed just because of a string-format mismatch.
        const toDateOnly = (date?: Date | string | null) =>
          date ? new Date(date).toISOString().split("T")[0] : null;
        const sortedTopics = (topics?: string[] | null) =>
          JSON.stringify([...(topics || [])].sort());

        for (const hackathon of enhancedHackathons) {
          const existing =
            existingByNormalizedUrl.get(normalizeUrl(hackathon.url)) ??
            findFuzzyMatch(hackathon);

          const incoming = {
            name: hackathon.name,
            city: hackathon.city || null,
            country_code: hackathon.country_code || null,
            date_start: toDateOnly(hackathon.date_start),
            date_end: toDateOnly(hackathon.date_end),
            topics: hackathon.topics || null,
            notes: hackathon.notes || null,
          };

          if (!existing) {
            hackathonsToInsert.push({
              ...incoming,
              url: hackathon.url,
              source: hackathon.source,
              notified: testMode,
              is_new: true,
            });
            continue;
          }

          const dateChanged =
            incoming.date_start !== toDateOnly(existing.date_start) ||
            incoming.date_end !== toDateOnly(existing.date_end);
          const locationChanged =
            incoming.city !== existing.city ||
            incoming.country_code !== existing.country_code;
          const nameChanged = incoming.name !== existing.name;
          const notesChanged = incoming.notes !== existing.notes;
          const topicsChanged =
            sortedTopics(incoming.topics) !== sortedTopics(existing.topics);

          if (
            !dateChanged &&
            !locationChanged &&
            !nameChanged &&
            !notesChanged &&
            !topicsChanged
          ) {
            continue;
          }

          hackathonsToUpdate.push({
            id: existing.id,
            // Only a date or location change is notification-worthy (per
            // issue #23's own recommendation) - a title/notes/topics edit
            // updates the stored record silently.
            notable: dateChanged || locationChanged,
            fields: { ...incoming, updated_at: new Date().toISOString() },
          });
        }

        if (hackathonsToInsert.length > 0) {
          console.log(
            `Inserting ${hackathonsToInsert.length} new hackathons in batch...`,
          );

          const { data: inserted, error } = await supabaseAdmin
            .from("hackathons")
            // @ts-expect-error - Supabase generated types may not include insert shape
            .insert(hackathonsToInsert)
            .select();

          if (error) {
            throw error;
          }

          if (inserted) {
            newHackathons.push(...inserted);

            console.log(
              `Successfully inserted ${inserted.length} new hackathons`,
            );
          }
        } else {
          console.log("No new hackathons to insert");
        }

        if (hackathonsToUpdate.length > 0) {
          console.log(
            `Updating ${hackathonsToUpdate.length} existing hackathons whose source data changed...`,
          );

          for (const { id, notable, fields } of hackathonsToUpdate) {
            const { data: updated, error } = await supabaseAdmin
              .from("hackathons")
              // @ts-expect-error - Supabase generated types may not include update shape
              .update(fields)
              .eq("id", id)
              .select();

            if (error) {
              console.error(`Error updating hackathon ${id}:`, error);
              updateErrors.push(`${id}: ${error.message}`);
              continue;
            }

            if (updated?.[0]) {
              updatedHackathons.push(updated[0]);

              if (notable) {
                notableUpdates.push(updated[0]);
              }
            }
          }

          console.log(
            `Successfully updated ${updatedHackathons.length}/${hackathonsToUpdate.length} hackathons ` +
              `(${notableUpdates.length} with a date/location change, ${updateErrors.length} failed)`,
          );
        } else {
          console.log("No existing hackathons need updating");
        }
      }
    } catch (error) {
      insertionError =
        error instanceof Error ? error.message : "Database insertion failed";

      console.error("Database insertion failed:", error);
    }

    // ---------------------------------------------------------
    // 3. Update hackathon statuses
    // ---------------------------------------------------------
    let statusUpdateError: string | null = null;
    let statusesUpdated = false;

    try {
      const { error } = await supabaseAdmin.rpc("update_hackathon_statuses");

      if (error) {
        statusUpdateError = error.message;
        console.error("Error updating hackathon statuses:", error);
      } else {
        statusesUpdated = true;
        console.log("Hackathon statuses updated successfully");
      }
    } catch (error) {
      statusUpdateError =
        error instanceof Error ? error.message : "Status update failed";

      console.error("Error updating hackathon statuses:", error);
    }

    // ---------------------------------------------------------
    // 4. Determine whether data changed
    //
    // A successful RPC execution does NOT automatically mean
    // that the dataset changed.
    //
    // For now:
    // - inserted OR updated hackathons => data changed (issue #23 made
    //   in-place updates possible, so a changed date/location on an
    //   existing record is a real data change too, not just an insert)
    // - reset errors do not count as data changes
    //
    // Status transitions will be handled separately once the
    // RPC exposes the number of affected rows.
    // ---------------------------------------------------------
    const dataChanged =
      newHackathons.length > 0 || updatedHackathons.length > 0;

    // ---------------------------------------------------------
    // 5. Notifications
    // ---------------------------------------------------------
    const notificationErrors: string[] = [];
    let notificationsSent = false;

    if (newHackathons.length > 0 && !insertionError && !testMode) {
      console.log(
        `Sending notifications for ${newHackathons.length} new hackathons...`,
      );

      const discordBot = new DiscordBot();
      const telegramBot = new TelegramBot();
      const twitterBot = new TwitterBot();

      const notifications = await Promise.allSettled([
        discordBot.notifyNewHackathons(newHackathons),
        telegramBot.notifyNewHackathons(newHackathons),
        twitterBot.notifyNewHackathons(newHackathons),
      ]);

      notifications.forEach((result, index) => {
        if (result.status === "rejected") {
          const platform = ["Discord", "Telegram", "Twitter"][index];

          console.error(`${platform} notification failed:`, result.reason);

          notificationErrors.push(platform);
        }
      });

      // Mark as notified if at least one notification succeeded.
      if (notificationErrors.length < 3) {
        try {
          const { error } = await supabaseAdmin
            .from("hackathons")
            // @ts-expect-error - Supabase generated types may not include update shape
            .update({ notified: true })
            .in(
              "id",
              newHackathons.map((hackathon) => hackathon.id),
            );

          if (error) {
            throw error;
          }

          notificationsSent = true;

          console.log("Hackathons marked as notified");
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to mark hackathons as notified";

          console.error("Error updating notification status:", error);

          notificationErrors.push(`Supabase: ${message}`);
        }
      }
    } else if (newHackathons.length > 0 && insertionError) {
      console.log("Skipping notifications due to database insertion errors");
    } else if (testMode && newHackathons.length > 0) {
      console.log("Test mode: notifications skipped");
    } else {
      console.log("No new hackathons to notify");
    }

    // ---------------------------------------------------------
    // 6. README
    // ---------------------------------------------------------
    let readmeUpdated = false;
    let readmeError: string | null = null;

    if (dataChanged && !testMode && !insertionError) {
      try {
        console.log("Data changed, updating README via GitHub API...");

        const octokit = new Octokit({
          auth: process.env.GITHUB_TOKEN,
        });

        const readmeUpdater = new ReadmeUpdater();
        const newReadmeContent = await readmeUpdater.generateReadmeContent();

        const { data: currentFile } = await octokit.rest.repos.getContent({
          owner: "lorenzopalaia",
          repo: "hacktrack-eu",
          path: "README.md",
        });

        if ("content" in currentFile) {
          const currentContent = Buffer.from(
            currentFile.content,
            "base64",
          ).toString("utf-8");

          if (currentContent !== newReadmeContent) {
            await octokit.rest.repos.createOrUpdateFileContents({
              owner: "lorenzopalaia",
              repo: "hacktrack-eu",
              path: "README.md",
              message:
                "🔄 Auto-update README with latest hackathons [Automated]",
              content: Buffer.from(newReadmeContent).toString("base64"),
              sha: currentFile.sha,
            });

            readmeUpdated = true;

            console.log("README updated successfully via GitHub API");
          } else {
            console.log("README content unchanged, skipping update");
          }
        }
      } catch (error) {
        readmeError = error instanceof Error ? error.message : "Unknown error";

        console.error("Error updating README:", error);
      }
    } else if (testMode) {
      console.log("Test mode: README update skipped");
    } else if (!dataChanged) {
      console.log("No data changes detected, skipping README update");
    }

    // ---------------------------------------------------------
    // Final success state
    // ---------------------------------------------------------
    const sourceErrors = Object.entries(sourceResults)
      .filter(([, result]) => result.enabled && !result.success)
      .map(([source, result]) => ({
        source,
        error: result.error || "Source failed",
      }));

    const hasErrors =
      !!resetError ||
      !!insertionError ||
      !!statusUpdateError ||
      !!readmeError ||
      notificationErrors.length > 0 ||
      sourceErrors.length > 0 ||
      updateErrors.length > 0;

    // If every enabled source failed, this is definitely a
    // failed update even if the database operations themselves
    // happened to succeed.
    const success = !hasErrors && !allEnabledSourcesFailed;

    // A source that partially failed (some slugs/categories ok, some not)
    // still has `success: true` - the data it did return is real and worth
    // keeping - but the run is not fully clean either. Surface that as an
    // explicit `degraded` flag instead of letting it disappear into the
    // same boolean as a fully successful run (found in code review).
    const degraded =
      Object.values(sourceResults).some(
        (result) => result.enabled && result.status === "partial",
      ) || updateErrors.length > 0;

    MemoryOptimizer.logMemoryUsage("Final memory usage");

    return NextResponse.json(
      {
        success,
        degraded,
        testMode,

        parsed: parsedHackathons.length,
        inserted: newHackathons.length,
        updated: updatedHackathons.length,
        notableUpdates: notableUpdates.length,
        updateErrors: updateErrors.length > 0 ? updateErrors : undefined,

        dataChanged,

        sources: sourceResults,

        sourceErrors: sourceErrors.length > 0 ? sourceErrors : undefined,

        resetError,
        insertionError,

        statusUpdateError,
        statusesUpdated,

        notificationsSent,

        readmeUpdated,
        readmeError,

        notificationErrors:
          notificationErrors.length > 0 ? notificationErrors : undefined,

        timestamp: new Date().toISOString(),

        memoryUsage: MemoryOptimizer.getMemoryUsage(),
      },
      {
        status: success ? 200 : 500,
      },
    );
  } catch (error) {
    console.error("Update error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
