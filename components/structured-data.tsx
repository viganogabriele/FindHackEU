"use client";

import { Hackathon } from "@/types/hackathon";
import { europeanCountries } from "@/lib/european-countries";
import { SITE_URL } from "@/lib/site-url";

interface StructuredDataProps {
  hackathons?: Hackathon[];
  type?: "website" | "event" | "organization";
}

export function StructuredData({
  hackathons,
  type = "website",
}: StructuredDataProps) {
  const generateWebsiteSchema = () => ({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "FindHackEU",
    description: "Comprehensive list of hackathons happening across Europe",
    url: SITE_URL,
    publisher: {
      "@type": "Organization",
      name: "FindHackEU",
      url: SITE_URL,
      logo: `${SITE_URL}/images/logo.png`,
    },
  });

  const generateEventSchema = (hackathon: Hackathon) => {
    const formattedLocation = europeanCountries.formatLocation(
      hackathon.city,
      hackathon.country_code,
    );

    return {
      "@context": "https://schema.org",
      "@type": "Event",
      name: hackathon.name,
      description:
        hackathon.notes ||
        `Hackathon event${formattedLocation ? ` in ${formattedLocation}` : ""}`,
      startDate: hackathon.date_start,
      endDate: hackathon.date_end || hackathon.date_start,
      eventStatus:
        hackathon.status === "upcoming" ? "EventScheduled" : "EventCancelled",
      eventAttendanceMode: "OfflineEventAttendanceMode",
      location: formattedLocation
        ? {
            "@type": "Place",
            name: formattedLocation,
            address: {
              "@type": "PostalAddress",
              addressLocality: hackathon.city,
              addressCountry: hackathon.country_code,
            },
          }
        : undefined,
      url: hackathon.url,
      organizer: {
        "@type": "Organization",
        name: "Event Organizer",
      },
    };
  };

  const getSchema = () => {
    if (type === "website") {
      return generateWebsiteSchema();
    }
    if (type === "event" && hackathons?.length) {
      return hackathons.slice(0, 5).map(generateEventSchema);
    }
    return null;
  };

  const schema = getSchema();
  if (!schema) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(schema, null, 2),
      }}
    />
  );
}
