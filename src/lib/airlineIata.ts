export type AirlineIataLookupEntry = {
  iata: string;
  name?: string | null;
  aliases?: string[] | null;
};

const DEFAULT_AIRLINE_IATA_LOOKUP: AirlineIataLookupEntry[] = [
  { iata: "LA", name: "LATAM Airlines", aliases: ["latam", "latam airlines", "latam airlines brasil"] },
  { iata: "AR", name: "Aerolíneas Argentinas", aliases: ["aerolineas argentinas", "aerolineas"] },
  { iata: "TK", name: "Turkish Airlines", aliases: ["turkish", "turkish airlines"] },
  { iata: "H2", name: "Sky Airline", aliases: ["sky airline", "sky"] },
  { iata: "G3", name: "GOL", aliases: ["gol", "gol linhas aereas", "gol linhas aereas inteligentes"] },
  { iata: "AD", name: "Azul", aliases: ["azul", "azul linhas aereas"] },
  { iata: "AA", name: "American Airlines", aliases: ["american airlines", "american"] },
  { iata: "DL", name: "Delta Air Lines", aliases: ["delta", "delta air lines"] },
  { iata: "UA", name: "United Airlines", aliases: ["united", "united airlines"] },
  { iata: "AF", name: "Air France", aliases: ["air france"] },
  { iata: "KL", name: "KLM", aliases: ["klm", "klm royal dutch airlines"] },
  { iata: "IB", name: "Iberia", aliases: ["iberia"] },
  { iata: "LH", name: "Lufthansa", aliases: ["lufthansa"] },
  { iata: "UX", name: "Air Europa", aliases: ["air europa"] },
  { iata: "AV", name: "Avianca", aliases: ["avianca"] },
  { iata: "CM", name: "Copa Airlines", aliases: ["copa", "copa airlines"] },
  { iata: "AC", name: "Air Canada", aliases: ["air canada"] },
  { iata: "EK", name: "Emirates", aliases: ["emirates"] },
  { iata: "QR", name: "Qatar Airways", aliases: ["qatar", "qatar airways"] },
  { iata: "ET", name: "Ethiopian Airlines", aliases: ["ethiopian", "ethiopian airlines"] },
];

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAirlineKey(value?: string | null) {
  return normalizeText(value)
    .replace(/\b(ida|volta|trecho)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractIataFromAirlineText(value?: string | null) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  const byParen = raw.match(/\(([A-Z0-9]{2})\)/);
  if (byParen?.[1]) return byParen[1];

  if (/^[A-Z0-9]{2}$/.test(raw)) return raw;

  const byFlightPrefix = raw.match(/\b([A-Z0-9]{2})\s*\d{1,4}\b/);
  if (byFlightPrefix?.[1]) return byFlightPrefix[1];

  return "";
}

function mergeLookup(entries: AirlineIataLookupEntry[] = []) {
  const merged = new Map<string, AirlineIataLookupEntry>();
  [...entries, ...DEFAULT_AIRLINE_IATA_LOOKUP].forEach((entry) => {
    const iata = String(entry?.iata || "").trim().toUpperCase();
    if (!iata) return;
    const existing = merged.get(iata);
    if (!existing) {
      merged.set(iata, {
        iata,
        name: entry?.name || null,
        aliases: (entry?.aliases || []).filter(Boolean),
      });
      return;
    }
    const aliases = new Set<string>([
      ...((existing.aliases || []).map((alias) => String(alias).trim()).filter(Boolean)),
      ...((entry?.aliases || []).map((alias) => String(alias).trim()).filter(Boolean)),
    ]);
    merged.set(iata, {
      iata,
      name: existing.name || entry?.name || null,
      aliases: Array.from(aliases),
    });
  });
  return Array.from(merged.values());
}

export function mapAirlineLookupRows(rows: any[]) {
  return (rows || []).map((row: any) => ({
    iata: String(row?.iata_code || "").trim().toUpperCase(),
    name: String(row?.airline_name || "").trim(),
    aliases: Array.isArray(row?.airline_iata_aliases)
      ? row.airline_iata_aliases
          .map((item: any) => String(item?.alias || "").trim())
          .filter(Boolean)
      : [],
  }));
}

export function resolveAirlineIata(value?: string | null, extraLookup: AirlineIataLookupEntry[] = []) {
  const direct = extractIataFromAirlineText(value);
  if (direct) return direct;

  const key = normalizeAirlineKey(value);
  if (!key) return "";

  const lookup = mergeLookup(extraLookup);
  for (const item of lookup) {
    const nameKey = normalizeAirlineKey(item.name || "");
    if (nameKey && (key === nameKey || key.includes(nameKey) || nameKey.includes(key))) {
      return item.iata;
    }
    for (const alias of item.aliases || []) {
      const aliasKey = normalizeAirlineKey(alias);
      if (!aliasKey) continue;
      if (key === aliasKey || key.includes(aliasKey) || aliasKey.includes(key)) {
        return item.iata;
      }
    }
  }

  return "";
}

export function resolveAirlineNameByIata(iataCode?: string | null, extraLookup: AirlineIataLookupEntry[] = []) {
  const code = String(iataCode || "").trim().toUpperCase();
  if (!code) return "";

  const lookup = mergeLookup(extraLookup);
  const found = lookup.find((item) => String(item?.iata || "").trim().toUpperCase() === code);
  return String(found?.name || "").trim();
}
