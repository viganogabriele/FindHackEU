"use client";

import L from "leaflet";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { useTranslation } from "@/contexts/translation-context";
import { resolveMapCoordinates } from "@/lib/country-centroids";
import { useThemeStore } from "@/lib/theme-store";
import { HackathonCard } from "@/components/hackathon-card";
import type { Hackathon } from "@/types/hackathon";

const EUROPE_CENTER: [number, number] = [50.5, 10.5];

// Smaller than react-leaflet-cluster's 80px default so individual pins
// separate out of a cluster at a more reasonable zoom level.
const MAX_CLUSTER_RADIUS = 45;

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Leaflet's image paths are not discoverable by Next's bundler on their own.
// Keep the standard assets in public/leaflet so markers work in production too.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

const APPROXIMATE_MARKER_ICON = L.divIcon({
  className: "hackathon-map-approximate-marker",
  html: '<span aria-hidden="true"></span>',
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -32],
});

interface MappedHackathon {
  hackathon: Hackathon;
  coordinates: [number, number];
  approximate: boolean;
}

function mapHackathons(hackathons: Hackathon[]): MappedHackathon[] {
  return hackathons.flatMap((hackathon) => {
    const resolved = resolveMapCoordinates({
      latitude: hackathon.latitude,
      longitude: hackathon.longitude,
      countryCode: hackathon.country_code,
      city: hackathon.city,
    });

    return resolved
      ? [
          {
            hackathon,
            coordinates: [resolved.latitude, resolved.longitude],
            approximate: resolved.approximate,
          },
        ]
      : [];
  });
}

function MapViewport({ hackathons }: { hackathons: MappedHackathon[] }) {
  const map = useMap();
  const bounds = useMemo(
    () => hackathons.map(({ coordinates }) => coordinates),
    [hackathons],
  );

  useEffect(() => {
    if (bounds.length === 0) {
      map.setView(EUROPE_CENTER, 4);
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 8);
    } else {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
    }
  }, [bounds, map]);

  return null;
}

/**
 * True on a touch-first device. Written as a `useSyncExternalStore` rather
 * than `useEffect` + `setState` for the same reason `ThemeSwitcher` is: it
 * expresses "read this browser fact after hydration" without a cascading
 * render, which this repo's lint rules reject. The server snapshot is
 * `false`, so nothing about the desktop render changes.
 */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia?.("(pointer: coarse)");
      query?.addEventListener("change", onStoreChange);
      return () => query?.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia?.("(pointer: coarse)").matches ?? false,
    () => false,
  );
}

/**
 * On a touch device, Leaflet's one-finger drag swallows the page scroll: the
 * map takes up most of a phone's viewport, so a swipe that starts over it
 * pans the map instead of scrolling past it, and the page feels stuck.
 *
 * So on a coarse pointer the map starts non-draggable, and a single tap
 * turns dragging on - the same "opt in before I capture your gestures" idea
 * as Google Maps' two-finger overlay, but without an overlay that would
 * block taps on markers. Pinch-zoom, marker taps and popups all keep working
 * before activation; only panning waits for the tap.
 *
 * Deliberately fail-safe. The pointer check resolves to `false` on the
 * server and for every mouse/trackpad visitor, in which case this disables
 * nothing and renders nothing - desktop behaviour is untouched. The cleanup
 * re-enables dragging unconditionally, so no code path can leave a map that
 * cannot be panned; the worst case if the check ever misfires is one extra
 * tap.
 */
export function TouchDragGate() {
  const map = useMap();
  const { t } = useTranslation();
  const coarsePointer = useCoarsePointer();
  const [activated, setActivated] = useState(false);
  const needsTap = coarsePointer && !activated;

  useEffect(() => {
    if (!needsTap) return;

    map.dragging.disable();
    const activate = () => setActivated(true);
    map.on("click", activate);

    return () => {
      map.off("click", activate);
      map.dragging.enable();
    };
  }, [map, needsTap]);

  if (!needsTap) return null;

  return (
    // Below Leaflet's own controls (z-index 1000) and centred, so it clears
    // the top-left zoom control even on a 320px-wide screen.
    <div className="pointer-events-none absolute top-3 left-1/2 z-[500] -translate-x-1/2">
      <span className="rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-md ring-1 ring-border backdrop-blur">
        {t("map.tapToActivate")}
      </span>
    </div>
  );
}

export default function HackathonMap({
  hackathons,
}: {
  hackathons: Hackathon[];
}) {
  const { t } = useTranslation();
  const mappedHackathons = mapHackathons(hackathons);
  const { currentMode } = useThemeStore();
  const isDark = currentMode === "dark";

  return (
    <div className="relative z-0 overflow-hidden rounded-lg border bg-muted/20">
      <MapContainer
        center={EUROPE_CENTER}
        zoom={4}
        scrollWheelZoom
        // `dvh`, not `vh`: mobile browsers resolve `vh` against the
        // largest viewport (URL bar hidden), so `70vh` was taller than 70%
        // of what a visitor can actually see. The old `min-h-[24rem]`
        // (384px) floor also exceeded the whole viewport on a phone in
        // landscape, leaving no page to scroll around the map.
        className="h-[min(70dvh,42rem)] min-h-[18rem] w-full sm:min-h-[30rem]"
        zoomControl
      >
        <TileLayer
          key={currentMode}
          attribution={TILE_ATTRIBUTION}
          url={TILE_URL}
          className={isDark ? "hackathon-map-dark-tiles" : undefined}
        />
        <MapViewport hackathons={mappedHackathons} />
        <TouchDragGate />
        <MarkerClusterGroup
          chunkedLoading
          maxClusterRadius={MAX_CLUSTER_RADIUS}
        >
          {mappedHackathons.map(({ hackathon, coordinates, approximate }) => (
            <Marker
              key={hackathon.id}
              position={coordinates}
              title={hackathon.name}
              {...(approximate ? { icon: APPROXIMATE_MARKER_ICON } : {})}
            >
              <Popup minWidth={280} maxWidth={320}>
                <div className="hackathon-map-popup-card">
                  {approximate && (
                    <p className="mb-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
                      {t("map.approximateLocation")}
                    </p>
                  )}
                  <HackathonCard
                    hackathon={hackathon}
                    compact
                    titleLink
                    className="border-0 shadow-none"
                  />
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
      <p className="sr-only" aria-live="polite">
        {t("map.markers", { count: mappedHackathons.length })}
      </p>
    </div>
  );
}
