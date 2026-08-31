#!/usr/bin/env node
/**
 * Convenience CLI wrapper around POST /api/update, so triggering the
 * discovery pipeline locally doesn't require remembering the curl
 * incantation (auth header, x-test-mode, base URL). Reads CRON_SECRET the
 * same way the app itself does (.env.local via @next/env), so it always
 * matches whatever the running dev/prod server expects.
 *
 * Usage:
 *   npm run trigger-update                # test mode (no notifications/README)
 *   npm run trigger-update -- --live      # real mode (sends notifications, commits README)
 *   npm run trigger-update -- --url=https://your-deployment.example.com
 */
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const live = args.includes("--live");
const urlArg = args.find((a) => a.startsWith("--url="));
const baseUrl = urlArg
  ? urlArg.slice("--url=".length)
  : "http://localhost:3000";

const cronSecret = process.env.CRON_SECRET;

if (!cronSecret) {
  console.error(
    "CRON_SECRET is not set in .env.local - the server would reject this request anyway.",
  );
  process.exit(1);
}

console.log(
  `Triggering ${baseUrl}/api/update ${live ? "(LIVE mode - notifications + README commit)" : "(test mode)"}...`,
);

try {
  const response = await fetch(`${baseUrl}/api/update`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
      ...(live ? {} : { "x-test-mode": "true" }),
    },
  });

  const body = await response.json();

  console.log(`HTTP ${response.status}`);
  console.log(JSON.stringify(body, null, 2));

  if (!response.ok || body.success === false) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(
    `Failed to reach ${baseUrl} - is the dev/prod server actually running?`,
  );
  console.error(error);
  process.exitCode = 1;
}
