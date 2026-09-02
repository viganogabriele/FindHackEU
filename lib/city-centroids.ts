export interface CityCentroid {
  latitude: number;
  longitude: number;
}

/**
 * Approximate city-centre coordinates used as a fallback when a hackathon has
 * no geocoded `latitude`/`longitude` but does have a known `city`. This is a
 * static, deliberately non-exhaustive list of common European capitals and
 * tech hubs — it exists purely to avoid every ungeocoded event in a country
 * collapsing onto the same country-centroid point when the city is already
 * known. Like `lib/country-centroids.ts`, these are not real per-event
 * coordinates and must always be treated as approximate.
 *
 * Keys are normalized (lowercased, diacritics stripped, trimmed) via
 * `normalizeCityKey` — look up through `getCityCentroid` rather than indexing
 * this object directly.
 */
export const CITY_CENTROIDS: Readonly<Record<string, CityCentroid>> = {
  berlin: { latitude: 52.52, longitude: 13.405 },
  munich: { latitude: 48.1351, longitude: 11.582 },
  munchen: { latitude: 48.1351, longitude: 11.582 },
  hamburg: { latitude: 53.5511, longitude: 9.9937 },
  frankfurt: { latitude: 50.1109, longitude: 8.6821 },
  cologne: { latitude: 50.9375, longitude: 6.9603 },
  koln: { latitude: 50.9375, longitude: 6.9603 },
  stuttgart: { latitude: 48.7758, longitude: 9.1829 },
  dusseldorf: { latitude: 51.2277, longitude: 6.7735 },
  leipzig: { latitude: 51.3397, longitude: 12.3731 },
  dresden: { latitude: 51.0504, longitude: 13.7373 },
  paris: { latitude: 48.8566, longitude: 2.3522 },
  lyon: { latitude: 45.764, longitude: 4.8357 },
  marseille: { latitude: 43.2965, longitude: 5.3698 },
  toulouse: { latitude: 43.6047, longitude: 1.4442 },
  nantes: { latitude: 47.2184, longitude: -1.5536 },
  bordeaux: { latitude: 44.8378, longitude: -0.5792 },
  lille: { latitude: 50.6292, longitude: 3.0573 },
  strasbourg: { latitude: 48.5734, longitude: 7.7521 },
  london: { latitude: 51.5074, longitude: -0.1278 },
  manchester: { latitude: 53.4808, longitude: -2.2426 },
  birmingham: { latitude: 52.4862, longitude: -1.8904 },
  edinburgh: { latitude: 55.9533, longitude: -3.1883 },
  glasgow: { latitude: 55.8642, longitude: -4.2518 },
  bristol: { latitude: 51.4545, longitude: -2.5879 },
  leeds: { latitude: 53.8008, longitude: -1.5491 },
  cambridge: { latitude: 52.2053, longitude: 0.1218 },
  oxford: { latitude: 51.752, longitude: -1.2577 },
  milan: { latitude: 45.4642, longitude: 9.19 },
  milano: { latitude: 45.4642, longitude: 9.19 },
  rome: { latitude: 41.9028, longitude: 12.4964 },
  roma: { latitude: 41.9028, longitude: 12.4964 },
  turin: { latitude: 45.0703, longitude: 7.6869 },
  torino: { latitude: 45.0703, longitude: 7.6869 },
  naples: { latitude: 40.8518, longitude: 14.2681 },
  napoli: { latitude: 40.8518, longitude: 14.2681 },
  bologna: { latitude: 44.4949, longitude: 11.3426 },
  florence: { latitude: 43.7696, longitude: 11.2558 },
  firenze: { latitude: 43.7696, longitude: 11.2558 },
  venice: { latitude: 45.4408, longitude: 12.3155 },
  venezia: { latitude: 45.4408, longitude: 12.3155 },
  genoa: { latitude: 44.4056, longitude: 8.9463 },
  genova: { latitude: 44.4056, longitude: 8.9463 },
  padova: { latitude: 45.4064, longitude: 11.8768 },
  padua: { latitude: 45.4064, longitude: 11.8768 },
  trento: { latitude: 46.0748, longitude: 11.1217 },
  madrid: { latitude: 40.4168, longitude: -3.7038 },
  barcelona: { latitude: 41.3874, longitude: 2.1686 },
  valencia: { latitude: 39.4699, longitude: -0.3763 },
  seville: { latitude: 37.3891, longitude: -5.9845 },
  sevilla: { latitude: 37.3891, longitude: -5.9845 },
  bilbao: { latitude: 43.263, longitude: -2.935 },
  malaga: { latitude: 36.7213, longitude: -4.4214 },
  amsterdam: { latitude: 52.3676, longitude: 4.9041 },
  rotterdam: { latitude: 51.9244, longitude: 4.4777 },
  "the hague": { latitude: 52.0705, longitude: 4.3007 },
  utrecht: { latitude: 52.0907, longitude: 5.1214 },
  eindhoven: { latitude: 51.4416, longitude: 5.4697 },
  groningen: { latitude: 53.2194, longitude: 6.5665 },
  delft: { latitude: 52.0116, longitude: 4.3571 },
  warsaw: { latitude: 52.2297, longitude: 21.0122 },
  warszawa: { latitude: 52.2297, longitude: 21.0122 },
  krakow: { latitude: 50.0647, longitude: 19.945 },
  cracow: { latitude: 50.0647, longitude: 19.945 },
  wroclaw: { latitude: 51.1079, longitude: 17.0385 },
  poznan: { latitude: 52.4064, longitude: 16.9252 },
  gdansk: { latitude: 54.352, longitude: 18.6466 },
  vienna: { latitude: 48.2082, longitude: 16.3738 },
  wien: { latitude: 48.2082, longitude: 16.3738 },
  graz: { latitude: 47.0707, longitude: 15.4395 },
  linz: { latitude: 48.3069, longitude: 14.2858 },
  innsbruck: { latitude: 47.2692, longitude: 11.4041 },
  zurich: { latitude: 47.3769, longitude: 8.5417 },
  geneva: { latitude: 46.2044, longitude: 6.1432 },
  geneve: { latitude: 46.2044, longitude: 6.1432 },
  basel: { latitude: 47.5596, longitude: 7.5886 },
  bern: { latitude: 46.948, longitude: 7.4474 },
  lausanne: { latitude: 46.5197, longitude: 6.6323 },
  stockholm: { latitude: 59.3293, longitude: 18.0686 },
  gothenburg: { latitude: 57.7089, longitude: 11.9746 },
  malmo: { latitude: 55.605, longitude: 13.0038 },
  uppsala: { latitude: 59.8586, longitude: 17.6389 },
  copenhagen: { latitude: 55.6761, longitude: 12.5683 },
  aarhus: { latitude: 56.1629, longitude: 10.2039 },
  oslo: { latitude: 59.9139, longitude: 10.7522 },
  bergen: { latitude: 60.3913, longitude: 5.3221 },
  trondheim: { latitude: 63.4305, longitude: 10.3951 },
  helsinki: { latitude: 60.1699, longitude: 24.9384 },
  espoo: { latitude: 60.2055, longitude: 24.6559 },
  tampere: { latitude: 61.4978, longitude: 23.761 },
  dublin: { latitude: 53.3498, longitude: -6.2603 },
  cork: { latitude: 51.8985, longitude: -8.4756 },
  galway: { latitude: 53.2707, longitude: -9.0568 },
  lisbon: { latitude: 38.7223, longitude: -9.1393 },
  lisboa: { latitude: 38.7223, longitude: -9.1393 },
  porto: { latitude: 41.1579, longitude: -8.6291 },
  braga: { latitude: 41.5454, longitude: -8.4265 },
  brussels: { latitude: 50.8503, longitude: 4.3517 },
  bruxelles: { latitude: 50.8503, longitude: 4.3517 },
  antwerp: { latitude: 51.2194, longitude: 4.4025 },
  ghent: { latitude: 51.0543, longitude: 3.7174 },
  leuven: { latitude: 50.8798, longitude: 4.7005 },
  prague: { latitude: 50.0755, longitude: 14.4378 },
  praha: { latitude: 50.0755, longitude: 14.4378 },
  brno: { latitude: 49.1951, longitude: 16.6068 },
  budapest: { latitude: 47.4979, longitude: 19.0402 },
  athens: { latitude: 37.9838, longitude: 23.7275 },
  athina: { latitude: 37.9838, longitude: 23.7275 },
  thessaloniki: { latitude: 40.6401, longitude: 22.9444 },
  bucharest: { latitude: 44.4268, longitude: 26.1025 },
  bucuresti: { latitude: 44.4268, longitude: 26.1025 },
  "cluj-napoca": { latitude: 46.7712, longitude: 23.6236 },
  sofia: { latitude: 42.6977, longitude: 23.3219 },
  zagreb: { latitude: 45.815, longitude: 15.9819 },
  ljubljana: { latitude: 46.0569, longitude: 14.5058 },
  bratislava: { latitude: 48.1486, longitude: 17.1077 },
  tallinn: { latitude: 59.437, longitude: 24.7536 },
  riga: { latitude: 56.9496, longitude: 24.1052 },
  vilnius: { latitude: 54.6872, longitude: 25.2797 },
  reykjavik: { latitude: 64.1466, longitude: -21.9426 },
  luxembourg: { latitude: 49.6116, longitude: 6.1319 },
  belgrade: { latitude: 44.7866, longitude: 20.4489 },
  beograd: { latitude: 44.7866, longitude: 20.4489 },
  istanbul: { latitude: 41.0082, longitude: 28.9784 },
  ankara: { latitude: 39.9334, longitude: 32.8597 },
  kyiv: { latitude: 50.4501, longitude: 30.5234 },
  kiev: { latitude: 50.4501, longitude: 30.5234 },
};

/**
 * Normalizes a free-text city name into a lookup key: trims whitespace,
 * lowercases, and strips diacritics (e.g. "München" -> "munchen") so common
 * spelling/locale variants of the same city resolve to the same entry.
 */
export function normalizeCityKey(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function getCityCentroid(
  city: string | null | undefined,
): CityCentroid | undefined {
  if (!city) {
    return undefined;
  }

  const key = normalizeCityKey(city);
  if (!key) {
    return undefined;
  }

  return CITY_CENTROIDS[key];
}
