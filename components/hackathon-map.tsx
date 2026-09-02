"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
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

const LIGHT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const LIGHT_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// CARTO's dark_all basemap - the usual free/no-key choice for this - was
// verified live (2026-09-02) to now serve an "API KEY REQUIRED" watermark
// tile instead of the map, i.e. it's no longer usable without a key. Esri's
// World Dark Gray Canvas is used instead: also free, no API key, verified
// live to return real (non-watermarked) tiles. Attribution text is Esri's
// own published copyright string for this service.
//
// Esri's Dark Gray Canvas is split into two layers by design: "Base" (just
// muted landmass/water, no roads/labels/borders) and "Reference" (roads,
// place labels, boundaries - meant to be layered on TOP of Base). Using
// only Base renders a dark map with no streets or place names at all - a
// real bug found via live testing, not a Base-only style choice - so both
// layers are used together, Reference stacked above Base.
const DARK_TILE_BASE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";
const DARK_TILE_REFERENCE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}";
const DARK_TILE_ATTRIBUTION =
  "Esri, HERE, Garmin, &copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors, and the GIS user community";

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
    <div className="relative overflow-hidden rounded-lg border bg-muted/20">
      <MapContainer
        center={EUROPE_CENTER}
        zoom={4}
        scrollWheelZoom
        className="h-[min(70vh,42rem)] min-h-[24rem] w-full sm:min-h-[30rem]"
        zoomControl
      >
        {isDark ? (
          <>
            <TileLayer key="dark-base" url={DARK_TILE_BASE_URL} />
            <TileLayer
              key="dark-reference"
              attribution={DARK_TILE_ATTRIBUTION}
              url={DARK_TILE_REFERENCE_URL}
            />
          </>
        ) : (
          <TileLayer
            key="light"
            attribution={LIGHT_TILE_ATTRIBUTION}
            url={LIGHT_TILE_URL}
          />
        )}
        <MapViewport hackathons={mappedHackathons} />
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
