/**
 * The candidate review UI is intentionally unavailable until issue #67 adds
 * real authentication. Restricting it to an explicit development runtime
 * also keeps preview/staging deployments from being treated as trusted just
 * because they are not built with NODE_ENV=production.
 */
export function isDevOnlyEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === "development";
}

export function assertDevOnly(): void {
  if (!isDevOnlyEnabled()) {
    throw new Error("Not available outside development");
  }
}
