export type AirportCodeCityLookup = Record<string, string>;

const AIRPORT_CODE_CITY_LOOKUP_URL = "/data/airports-iata-city.json";

let airportLookupCache: AirportCodeCityLookup | null = null;
let airportLookupPromise: Promise<AirportCodeCityLookup> | null = null;

function normalizeAirportLookup(raw: unknown): AirportCodeCityLookup {
  if (!raw || typeof raw !== "object") return {};
  const out: AirportCodeCityLookup = {};
  Object.entries(raw as Record<string, unknown>).forEach(([code, city]) => {
    const normalizedCode = String(code || "").trim().toUpperCase();
    const normalizedCity = String(city || "").trim();
    if (!/^[A-Z]{3}$/.test(normalizedCode) || !normalizedCity) return;
    out[normalizedCode] = normalizedCity;
  });
  return out;
}

export function getAirportCodeCityLookupCache() {
  return airportLookupCache || {};
}

export async function loadAirportCodeCityLookup(): Promise<AirportCodeCityLookup> {
  if (airportLookupCache) return airportLookupCache;
  if (airportLookupPromise) return airportLookupPromise;
  if (typeof window === "undefined") return {};

  airportLookupPromise = (async () => {
    try {
      const response = await fetch(AIRPORT_CODE_CITY_LOOKUP_URL, {
        cache: "force-cache",
      });
      if (!response.ok) return {};
      const json = await response.json();
      return normalizeAirportLookup(json);
    } catch {
      return {};
    }
  })();

  const loaded = await airportLookupPromise;
  airportLookupCache = loaded;
  airportLookupPromise = null;
  return loaded;
}
