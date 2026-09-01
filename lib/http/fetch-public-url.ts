import {
  fetchWithRetry,
  type FetchWithRetryOptions,
} from "@/lib/http/fetch-with-retry";

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class UnsafeUrlError extends Error {
  constructor(
    readonly url: string,
    reason: string,
  ) {
    super(`Unsafe URL: ${reason}`);
    this.name = "UnsafeUrlError";
  }
}

function isBlockedIpv4(hostname: string): boolean {
  const octets = hostname.split(".").map((part) => Number(part));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first, second] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 0) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51) ||
    (first === 203 && second === 0) ||
    first >= 224
  );
}

function isBlockedIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();

  const sections = normalized.split("::");
  if (sections.length > 2) return false;

  const parseSection = (section: string): number[] => {
    if (!section) return [];

    const parts = section.split(":");
    const groups: number[] = [];
    for (const part of parts) {
      if (/^\d+(?:\.\d+){3}$/.test(part)) {
        const octets = part.split(".").map(Number);
        if (
          octets.some(
            (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
          )
        ) {
          return [];
        }
        groups.push((octets[0] << 8) | octets[1]);
        groups.push((octets[2] << 8) | octets[3]);
      } else if (/^[0-9a-f]{1,4}$/.test(part)) {
        groups.push(Number.parseInt(part, 16));
      } else {
        return [];
      }
    }
    return groups;
  };

  const left = parseSection(sections[0]);
  const right = parseSection(sections[1] ?? "");
  const groups =
    sections.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right]
      : left;

  if (groups.length !== 8) return false;

  const isUnspecified = groups.every((group) => group === 0);
  const isLoopback =
    isUnspecified ||
    (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1);
  const first = groups[0];
  const isPrivateOrReserved =
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00;

  if (isLoopback || isPrivateOrReserved) {
    return true;
  }

  const isIpv4Mapped =
    groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isIpv4Mapped) {
    const octets = [
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ];
    return isBlockedIpv4(octets.join("."));
  }

  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  if (isBlockedIpv4(normalized) || isBlockedIpv6(normalized)) {
    return true;
  }

  if (
    new Set([
      "localhost",
      "localhost.localdomain",
      "ip6-localhost",
      "ip6-loopback",
      "metadata",
      "metadata.google.internal",
      "instance-data",
      "instance-data.ec2.internal",
      "host.docker.internal",
      "kubernetes.default",
      "kubernetes.default.svc",
    ]).has(normalized)
  ) {
    return true;
  }

  return [".localhost", ".local", ".localdomain", ".internal", ".svc"].some(
    (suffix) => normalized.endsWith(suffix),
  );
}

/**
 * Accept only absolute HTTP(S) URLs whose destination is not a loopback,
 * private, link-local, reserved, or cloud-metadata address. This is a
 * hostname-level guard for discovery inputs; redirect targets are validated
 * separately by fetchPublicUrl before they are requested.
 */
export function assertPublicHttpUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(rawUrl, "not an absolute URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError(rawUrl, "only http and https are allowed");
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeUrlError(rawUrl, "credentials in URLs are not allowed");
  }

  if (isBlockedHostname(parsed.hostname)) {
    throw new UnsafeUrlError(rawUrl, "private or reserved destination");
  }

  return parsed;
}

/**
 * Fetch a public URL without allowing native fetch to follow an unvalidated
 * redirect. Every redirect destination is checked with the same policy.
 */
export async function fetchPublicUrl(
  rawUrl: string,
  options: RequestInit = {},
  retryOptions?: FetchWithRetryOptions,
): Promise<Response> {
  let current = assertPublicHttpUrl(rawUrl);

  for (let redirectCount = 0; ; redirectCount++) {
    const response = await fetchWithRetry(
      current.toString(),
      { ...options, redirect: "manual" },
      retryOptions,
    );

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    if (redirectCount >= MAX_REDIRECTS) {
      throw new Error(`Too many redirects while fetching ${rawUrl}`);
    }

    const location = response.headers.get("location");
    if (!location) {
      throw new Error(`Redirect from ${current} did not include a location`);
    }

    current = assertPublicHttpUrl(new URL(location, current).toString());
  }
}
