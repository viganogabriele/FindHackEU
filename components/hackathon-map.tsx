"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import { useTranslation } from "@/contexts/translation-context";
import { europeanCountries } from "@/lib/european-countries";
import type { Hackathon } from "@/types/hackathon";

const EUROPE_CENTER: [number, number] = [50.5, 10.5];

// Leaflet's image paths are not discoverable by Next's bundler on their own.
// Keep the standard assets in public/leaflet so markers work in production too.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

function MapViewport({ hackathons }: { hackathons: Hackathon[] }) {
  const map = useMap();
  const bounds = useMemo(
    () =>
      hackathons
        .filter(hasCoordinates)
        .map(
          (hackathon) =>
            [hackathon.latitude!, hackathon.longitude!] as [number, number],
        ),
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

function hasCoordinates(
  hackathon: Hackathon,
): hackathon is Hackathon & { latitude: number; longitude: number } {
  return (
    typeof hackathon.latitude === "number" &&
    Number.isFinite(hackathon.latitude) &&
    typeof hackathon.longitude === "number" &&
    Number.isFinite(hackathon.longitude)
  );
}

export default function HackathonMap({
  hackathons,
}: {
  hackathons: Hackathon[];
}) {
  const { t, formatDateRange } = useTranslation();
  const mappedHackathons = hackathons.filter(hasCoordinates);

  return (
    <div className="relative overflow-hidden rounded-lg border bg-muted/20">
      <MapContainer
        center={EUROPE_CENTER}
        zoom={4}
        scrollWheelZoom
        className="h-[min(70vh,42rem)] min-h-[24rem] w-full sm:min-h-[30rem]"
        zoomControl
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewport hackathons={mappedHackathons} />
        <MarkerClusterGroup chunkedLoading>
          {mappedHackathons.map((hackathon) => (
            <Marker
              key={hackathon.id}
              position={[hackathon.latitude, hackathon.longitude]}
              title={hackathon.name}
            >
              <Popup>
                <div className="space-y-1.5 text-sm">
                  <h3 className="font-semibold">{hackathon.name}</h3>
                  <p>
                    {europeanCountries.formatLocation(
                      hackathon.city,
                      hackathon.country_code,
                    )}
                  </p>
                  <p>
                    {formatDateRange(hackathon.date_start, hackathon.date_end)}
                  </p>
                  <a
                    href={hackathon.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    {t("action.viewEvent")}
                  </a>
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
