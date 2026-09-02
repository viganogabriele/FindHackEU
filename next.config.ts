import type { NextConfig } from "next";
import { PREVIEW_IMAGE_HOSTS } from "./lib/constants/preview-image-hosts";

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,

  // react-leaflet@5's MapContainer stores its Leaflet Map instance in a plain
  // useRef guarded only by `!mapInstanceRef.current`, but its unmount effect
  // (`context.map.remove()`) never resets that ref back to undefined. Under
  // React Strict Mode's dev-only double-invoke (mount -> simulated unmount ->
  // remount), that leaves the second mount reusing a stale `context` wrapping
  // an already-torn-down Leaflet map, which crashes MarkerClusterGroup/Marker
  // children with "Cannot read properties of undefined (reading
  // '_leaflet_events'/'createIcon')" when the map view is opened
  // (components/hackathon-map.tsx). This is internal to react-leaflet's
  // closure (no ref/prop lets us guard it from our own component) and is a
  // well-known react-leaflet + Strict Mode incompatibility, not a bug in this
  // codebase. Strict Mode's double-invoke is dev-only, so this has no effect
  // on production builds/behavior. Do not silently revert this without first
  // confirming react-leaflet has actually fixed the underlying issue.
  reactStrictMode: false,

  images: {
    // An explicit allowlist, NOT a wildcard. `hostname: "*"` here means
    // "any host" to Next, which made /_next/image an open image proxy on
    // the deployment: an arbitrary third-party image could be fetched and
    // re-served through this domain, consuming its metered image
    // optimization quota. See lib/constants/preview-image-hosts.ts - that
    // module is also what keeps an unfetchable URL out of the database.
    remotePatterns: PREVIEW_IMAGE_HOSTS.map((hostname) => ({
      protocol: "https" as const,
      hostname,
    })),
    formats: ["image/webp", "image/avif"],
    minimumCacheTTL: 60,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Headers for security and SEO
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
        ],
      },
    ];
  },

  // Experimental features for performance
  experimental: {
    optimizePackageImports: ["lucide-react", "react-icons"],
  },
};

export default nextConfig;
