import { NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { supabaseAdmin } from "@/lib/supabase";
import { LumaParser } from "@/lib/parsers/luma-parser";
import { LablabParser } from "@/lib/parsers/lablab-parser";
import { DevfolioParser } from "@/lib/parsers/devfolio-parser";
import { MlhParser } from "@/lib/parsers/mlh-parser";
import { EthGlobalParser } from "@/lib/parsers/ethglobal-parser";
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
import type {
  ParseStatus,
  DroppedCounts,
} from "@/lib/providers/provider.interface";

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
  // Per-stage rejection counts for this source's own run (issue #31) -
  // absent/undefined for a disabled source or one that hasn't run yet.
  dropped?: DroppedCounts;
}

export async function POST(request: Request) {
  // Id of this run's `update_runs` row (issue #32), set once auth succeeds
  // and a row is actually created. Declared outside the try below so the
  // outer catch (an unhandled exception anywhere in the handler) can still
  // find it and record the run as failed rather than leaving it stuck at
  // status 'running' forever.
  let runId: string | null = null;

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
    // Run history (issue #32)
    //
    // Insert a 'running' row now that auth has actually passed - a rejected
    // request (missing CRON_SECRET, wrong bearer token) never reaches here,
    // so it never creates a run record. Mirrors the existing `resetError`
    // pattern just below: a failure to write this bookkeeping row must only
    // be logged, never thrown, since it must not mask the pipeline's real
    // result.
    // ---------------------------------------------------------
    try {
      const { data: runRow, error: runInsertError } = await supabaseAdmin
        .from("update_runs")
        // @ts-expect-error - Supabase generated types may not include insert shape
        .insert({ status: "running", test_mode: testMode })
        .select("id")
        .single();

      if (runInsertError) {
        console.error("Error creating update_runs row:", runInsertError);
      } else {
        runId = (runRow as { id: string } | null)?.id ?? null;
      }
    } catch (error) {
      console.error("Error creating update_runs row:", error);
    }

    // ---------------------------------------------------------
    // Source configuration
    //
    // Adding a new source means creating a class that implements
    // `Provider` (see lib/providers/provider.interface.ts) and
    // adding an instance to this array - no other change to this
    // orchestrator should be required.
    //
    // LabLab is intentionally disabled (see lib/parsers/lablab-parser.ts
    // for the verified reason - it is NOT Cloudflare-blocked; the site's
    // migration to Next.js App Router removed the JSON endpoint this
    // parser relies on, and re-enabling it needs an HTML-scraper rewrite).
    // ---------------------------------------------------------
    const providers: Provider[] = [
      new LumaParser(),
      new LablabParser(),
      new DevfolioParser(),
      new MlhParser(),
      new EthGlobalParser(),
    ];

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
        sourceResults[provider.name].dropped = result.dropped;

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

    // Cross-source duplicate count (issue #31): this pass runs once, after
    // every provider's output has already been combined, so it isn't
    // attributable to any single source's `dropped` counts - tracked here
    // as a single aggregate instead.
    const duplicatesRemoved =
      parsedHackathons.length - deduplicatedHackathons.length;

    console.log(
      `After deduplication: ${deduplicatedHackathons.length} hackathons ` +
        `(${duplicatesRemoved} duplicate(s) removed)`,
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
          location_type: string;
          venue: string | null;
          date_start: string;
          date_end: string | null;
          topics: string[] | null;
          notes: string | null;
        };

        const existingRowList = await fetchAllRows<ExistingRow>((from, to) =>
          supabaseAdmin
            .from("hackathons")
            .select(
              "id, url, name, city, country_code, location_type, venue, date_start, date_end, topics, notes",
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
        // stored Postgres timestamptz string to the same full-precision ISO
        // shape, so comparing an incoming value against what's already in
        // the database doesn't flag every row as changed just because of a
        // string-format mismatch (e.g. millisecond precision differences).
        //
        // This used to truncate to "YYYY-MM-DD" (issue #20) and, critically,
        // that truncated value was what actually got inserted/updated into
        // `date_start`/`date_end` - even though those columns are
        // `timestamptz` and the parsers already produce full timestamps.
        // Every event's real start/end time was silently discarded at
        // write time, regardless of source. Full timestamp precision is now
        // preserved in storage; only the fuzzy-match day-bucketing below
        // (`existingRowsByDay`/`findFuzzyMatch`) still deliberately reasons
        // in day-only terms, since that's a "same calendar day" heuristic,
        // not a storage concern.
        const toFullTimestamp = (date?: Date | string | null) =>
          date ? new Date(date).toISOString() : null;
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
            // Issue #21: default to the DB column's own default ('tbd')
            // when a parser has no signal, rather than each parser having
            // to repeat that fallback itself.
            location_type: hackathon.location_type || "tbd",
            venue: hackathon.venue || null,
            date_start: toFullTimestamp(hackathon.date_start),
            date_end: toFullTimestamp(hackathon.date_end),
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
            incoming.date_start !== toFullTimestamp(existing.date_start) ||
            incoming.date_end !== toFullTimestamp(existing.date_end);
          const locationChanged =
            incoming.city !== existing.city ||
            incoming.country_code !== existing.country_code;
          // Tracked separately from `locationChanged` (city/country) since
          // it's a distinct signal (issue #21): a hackathon flipping
          // physical -> online/hybrid, or an organizer adding/changing a
          // venue, doesn't necessarily come with a city/country change too.
          const locationTypeChanged =
            incoming.location_type !== existing.location_type;
          const venueChanged = incoming.venue !== existing.venue;
          const nameChanged = incoming.name !== existing.name;
          const notesChanged = incoming.notes !== existing.notes;
          const topicsChanged =
            sortedTopics(incoming.topics) !== sortedTopics(existing.topics);

          if (
            !dateChanged &&
            !locationChanged &&
            !locationTypeChanged &&
            !venueChanged &&
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
            // updates the stored record silently. A location_type/venue
            // change is bundled into the same "notable" bucket as
            // locationChanged (issue #21): a hackathon switching to
            // online/hybrid, or gaining venue detail, is exactly the kind
            // of change a subscriber would want to know about, same as a
            // city/country change.
            notable:
              dateChanged ||
              locationChanged ||
              locationTypeChanged ||
              venueChanged,
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
    // Real transition count from the RPC (issue #27) - e.g. rows that
    // flipped upcoming -> past with no other field changing, which
    // wouldn't otherwise show up in newHackathons/updatedHackathons at
    // all. Kept separate from statusesUpdated (which just means "the RPC
    // call itself succeeded") so a successful no-op run is distinguishable
    // from a run that actually changed something.
    let statusTransitionCount = 0;

    try {
      const { data, error } = await supabaseAdmin.rpc(
        "update_hackathon_statuses",
      );

      if (error) {
        statusUpdateError = error.message;
        console.error("Error updating hackathon statuses:", error);
      } else {
        statusesUpdated = true;
        // The RPC now returns an integer (count of rows whose status
        // actually changed) instead of void - guard defensively in case
        // an older, unmigrated database still has the void-returning
        // version (data would be null/undefined there).
        statusTransitionCount = typeof data === "number" ? data : 0;
        console.log(
          `Hackathon statuses updated successfully (${statusTransitionCount} transition(s))`,
        );
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
    // - inserted OR updated hackathons => data changed (issue #23 made
    //   in-place updates possible, so a changed date/location on an
    //   existing record is a real data change too, not just an insert)
    // - a real status transition (issue #27) => data changed too, so an
    //   upcoming -> past flip with no other field touched still triggers
    //   a README regeneration instead of leaving it showing a stale
    //   status until some unrelated insert/update happens to occur later
    // - reset errors do not count as data changes
    // ---------------------------------------------------------
    const dataChanged =
      newHackathons.length > 0 ||
      updatedHackathons.length > 0 ||
      statusTransitionCount > 0;

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

    // ---------------------------------------------------------
    // Run history (issue #32): record the final state of this run using
    // exactly the fields the JSON response below also reports, so the two
    // never drift. Same "log, don't throw" pattern as the insert above -
    // a failure here must never replace the pipeline's real response.
    // ---------------------------------------------------------
    if (runId) {
      try {
        const { error: runUpdateError } = await supabaseAdmin
          .from("update_runs")
          // @ts-expect-error - Supabase generated types may not include update shape
          .update({
            finished_at: new Date().toISOString(),
            status: success ? "success" : "failed",
            sources: sourceResults,
            parsed_count: parsedHackathons.length,
            inserted_count: newHackathons.length,
            updated_count: updatedHackathons.length,
            duplicates_removed: duplicatesRemoved,
            degraded,
          })
          .eq("id", runId);

        if (runUpdateError) {
          console.error("Error finalizing update_runs row:", runUpdateError);
        }
      } catch (error) {
        console.error("Error finalizing update_runs row:", error);
      }
    }

    return NextResponse.json(
      {
        success,
        degraded,
        testMode,

        parsed: parsedHackathons.length,
        inserted: newHackathons.length,
        updated: updatedHackathons.length,
        duplicatesRemoved,
        notableUpdates: notableUpdates.length,
        updateErrors: updateErrors.length > 0 ? updateErrors : undefined,

        dataChanged,

        sources: sourceResults,

        sourceErrors: sourceErrors.length > 0 ? sourceErrors : undefined,

        resetError,
        insertionError,

        statusUpdateError,
        statusesUpdated,
        statusTransitionCount,

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

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Run history (issue #32): an unhandled exception anywhere above still
    // needs its run row closed out as 'failed' rather than left stuck at
    // 'running' forever. Same "log, don't throw" pattern as elsewhere in
    // this file - never let this write mask the real 500 response below.
    if (runId) {
      try {
        const { error: runUpdateError } = await supabaseAdmin
          .from("update_runs")
          // @ts-expect-error - Supabase generated types may not include update shape
          .update({
            finished_at: new Date().toISOString(),
            status: "failed",
            error: errorMessage,
          })
          .eq("id", runId);

        if (runUpdateError) {
          console.error("Error finalizing update_runs row:", runUpdateError);
        }
      } catch (finalizeError) {
        console.error("Error finalizing update_runs row:", finalizeError);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: errorMessage,
      },
      { status: 500 },
    );
  }
}
