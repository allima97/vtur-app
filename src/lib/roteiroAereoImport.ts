export type ImportedRoteiroAereo = {
  trecho: string;
  cia_aerea: string;
  data_voo: string;
  data_inicio?: string;
  data_fim?: string;
  classe_reserva: string;
  hora_saida: string;
  aeroporto_saida: string;
  duracao_voo: string;
  tipo_voo: string;
  hora_chegada: string;
  aeroporto_chegada: string;
  tarifa_nome: string;
  reembolso_tipo: string;
  qtd_adultos: number;
  qtd_criancas: number;
  taxas: number;
  valor_total: number;
  ordem: number;
};

export type ParseImportedRoteiroAereoOptions = {
  airportAliasValues?: string[];
  airportCodeCityLookup?: Record<string, string>;
};

type AirportAliasEntry = {
  code: string;
  city: string;
  aliases: string[];
};

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  janeiro: 0,
  fev: 1,
  fevereiro: 1,
  mar: 2,
  marco: 2,
  "março": 2,
  abr: 3,
  abril: 3,
  mai: 4,
  maio: 4,
  jun: 5,
  junho: 5,
  jul: 6,
  julho: 6,
  ago: 7,
  agosto: 7,
  set: 8,
  setembro: 8,
  out: 9,
  outubro: 9,
  nov: 10,
  novembro: 10,
  dez: 11,
  dezembro: 11,
};

const RANGE_RE =
  /^(\d{1,2})\s+de\s+([a-zA-ZçÇãÃáÁàÀéÉêÊíÍóÓôÔõÕúÚ]+)\s*-\s*(\d{1,2})\s+de\s+([a-zA-ZçÇãÃáÁàÀéÉêÊíÍóÓôÔõÕúÚ]+)(?:\s*\(.+\))?$/i;
const SINGLE_DAY_RE =
  /^(\d{1,2})\s+de\s+([a-zA-ZçÇãÃáÁàÀéÉêÊíÍóÓôÔõÕúÚ]+)(?:\s*\(.+\))?$/i;
const DATE_CLASS_RE =
  /^(?:[a-zA-ZÀ-ÿ]{2,7},?\s*)?(\d{1,2})\s+de\s+([a-zA-ZçÇãÃáÁàÀéÉêÊíÍóÓôÔõÕúÚ]+)\s*-\s*(.+)$/i;
const PROVIDER2_DATE_TIME_RE = /^(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2}:\d{2})$/;
const PROVIDER_CARD_MARKERS = new Set(["aereo", "selecionado", "excluir", "detalhes", "multitrecho"]);
const AIRPORT_NOISE_WORDS_RE =
  /\b(aeroporto|aeropuerto|airport|internacional|international|intl|terminal|internat(?:ional)?|aerodrome)\b/gi;

const KNOWN_AIRPORT_ALIASES: AirportAliasEntry[] = [
  { code: "GRU", city: "São Paulo", aliases: ["gru", "guarulhos", "sao paulo - guarulhos", "sao paulo guarulhos"] },
  { code: "CGH", city: "São Paulo", aliases: ["cgh", "congonhas", "sao paulo - congonhas", "sao paulo congonhas"] },
  { code: "VCP", city: "Campinas", aliases: ["vcp", "viracopos", "campinas - viracopos", "campinas viracopos"] },
  { code: "SDU", city: "Rio de Janeiro", aliases: ["sdu", "santos dumont", "rio de janeiro - santos dumont", "rio de janeiro santos dumont"] },
  { code: "SCL", city: "Santiago", aliases: ["scl", "santiago", "comodoro arturo merino benitez", "santiago - comodoro arturo", "santiago - comodoro arturo merino benitez"] },
  { code: "FTE", city: "Calafate", aliases: ["fte", "el calafate", "calafate", "comandante armando tola", "el calafate comandante armando tola"] },
  { code: "USH", city: "Ushuaia", aliases: ["ush", "ushuaia", "malvinas argentinas", "ushuaia malvinas argentinas"] },
  { code: "GIG", city: "Rio de Janeiro", aliases: ["gig", "galeao", "galeão", "rio de janeiro - galeao", "rio de janeiro - galeão"] },
  { code: "BSB", city: "Brasília", aliases: ["bsb", "brasilia", "presidente juscelino kubitschek"] },
  { code: "CNF", city: "Belo Horizonte", aliases: ["cnf", "confins", "tancredo neves", "belo horizonte - confins"] },
  { code: "REC", city: "Recife", aliases: ["rec", "recife", "guararapes", "gilberto freyre"] },
  { code: "SSA", city: "Salvador", aliases: ["ssa", "salvador", "deputado luis eduardo magalhaes"] },
  { code: "FOR", city: "Fortaleza", aliases: ["for", "fortaleza", "pinto martins"] },
  { code: "POA", city: "Porto Alegre", aliases: ["poa", "porto alegre", "salgado filho"] },
  { code: "CWB", city: "Curitiba", aliases: ["cwb", "curitiba", "afonso pena"] },
  { code: "FLN", city: "Florianópolis", aliases: ["fln", "florianopolis", "hercilio luz"] },
  { code: "AEP", city: "Buenos Aires", aliases: ["aep", "aeroparque", "jorge newbery", "buenos aires - aeroparque"] },
  { code: "EZE", city: "Buenos Aires", aliases: ["eze", "ezeiza", "ministro pistarini", "buenos aires - ezeiza"] },
  { code: "MVD", city: "Montevidéu", aliases: ["mvd", "montevideo", "montevideu", "carrasco"] },
  { code: "LIM", city: "Lima", aliases: ["lim", "lima", "jorge chavez", "jorge chávez"] },
  { code: "NYC", city: "Nova Iorque", aliases: ["nyc", "new york", "new york city", "nova york", "nova iorque"] },
  { code: "JFK", city: "Nova Iorque", aliases: ["jfk", "john f kennedy", "john f. kennedy", "kennedy international", "new york - john f kennedy", "nova iorque - john f kennedy"] },
  { code: "LGA", city: "Nova Iorque", aliases: ["lga", "laguardia", "new york - laguardia", "nova iorque - laguardia"] },
  { code: "EWR", city: "Nova Iorque", aliases: ["ewr", "newark", "newark liberty", "newark liberty international"] },
  { code: "WAS", city: "Washington", aliases: ["was", "washington", "washington dc", "washington d.c", "washington d c"] },
  { code: "IAD", city: "Washington", aliases: ["iad", "dulles", "washington dulles"] },
  { code: "DCA", city: "Washington", aliases: ["dca", "ronald reagan", "reagan national", "washington reagan"] },
  { code: "BWI", city: "Washington", aliases: ["bwi", "baltimore washington", "baltimore/washington", "thurgood marshall"] },
  { code: "MIA", city: "Miami", aliases: ["mia", "miami"] },
  { code: "MCO", city: "Orlando", aliases: ["mco", "orlando"] },
  { code: "LAX", city: "Los Angeles", aliases: ["lax", "los angeles"] },
  { code: "SFO", city: "São Francisco", aliases: ["sfo", "san francisco", "sao francisco"] },
  { code: "ORD", city: "Chicago", aliases: ["ord", "o'hare", "ohare", "chicago"] },
  { code: "ATL", city: "Atlanta", aliases: ["atl", "atlanta", "hartsfield jackson"] },
  { code: "LHR", city: "Londres", aliases: ["lhr", "heathrow", "london heathrow", "londres heathrow", "london"] },
  { code: "CDG", city: "Paris", aliases: ["cdg", "charles de gaulle", "paris - charles de gaulle"] },
  { code: "AMS", city: "Amsterdã", aliases: ["ams", "amsterdam", "schiphol"] },
  { code: "MAD", city: "Madri", aliases: ["mad", "madrid", "barajas"] },
  { code: "LIS", city: "Lisboa", aliases: ["lis", "lisbon", "lisboa"] },
  { code: "FCO", city: "Roma", aliases: ["fco", "fiumicino", "rome fiumicino", "roma fiumicino", "rome", "roma"] },
  { code: "MXP", city: "Milão", aliases: ["mxp", "milan malpensa", "milao malpensa", "milan", "milao"] },
  { code: "LIN", city: "Milão", aliases: ["lin", "milan linate", "milao linate"] },
  { code: "BCN", city: "Barcelona", aliases: ["bcn", "barcelona", "el prat"] },
  { code: "FRA", city: "Frankfurt", aliases: ["fra", "frankfurt"] },
  { code: "MUC", city: "Munique", aliases: ["muc", "munich", "munique"] },
  { code: "ZRH", city: "Zurique", aliases: ["zrh", "zurich", "zurique"] },
  { code: "GVA", city: "Genebra", aliases: ["gva", "geneva", "genebra"] },
  { code: "OPO", city: "Porto", aliases: ["opo", "porto portugal", "francisco sa carneiro"] },
  { code: "DUB", city: "Dublin", aliases: ["dub", "dublin"] },
  { code: "IST", city: "Istambul", aliases: ["ist", "istanbul", "istambul"] },
  { code: "DXB", city: "Dubai", aliases: ["dxb", "dubai"] },
  { code: "DOH", city: "Doha", aliases: ["doh", "doha"] },
  { code: "AUH", city: "Abu Dhabi", aliases: ["auh", "abu dhabi"] },
  { code: "SIN", city: "Singapura", aliases: ["sin", "singapore", "singapura", "changi"] },
  { code: "HKG", city: "Hong Kong", aliases: ["hkg", "hong kong"] },
  { code: "NRT", city: "Tóquio", aliases: ["nrt", "narita", "tokyo narita", "toquio narita"] },
  { code: "HND", city: "Tóquio", aliases: ["hnd", "haneda", "tokyo haneda", "toquio haneda"] },
  { code: "BOS", city: "Boston", aliases: ["bos", "boston", "logan"] },
  { code: "DFW", city: "Dallas", aliases: ["dfw", "dallas fort worth", "dallas/fort worth"] },
  { code: "IAH", city: "Houston", aliases: ["iah", "houston", "george bush intercontinental"] },
  { code: "SEA", city: "Seattle", aliases: ["sea", "seattle", "sea tac", "seatac"] },
  { code: "LAS", city: "Las Vegas", aliases: ["las", "las vegas", "mccarran", "harry reid"] },
  { code: "DEN", city: "Denver", aliases: ["den", "denver"] },
  { code: "PHL", city: "Filadélfia", aliases: ["phl", "philadelphia", "filadelfia"] },
  { code: "DTW", city: "Detroit", aliases: ["dtw", "detroit"] },
  { code: "MSP", city: "Minneapolis", aliases: ["msp", "minneapolis", "saint paul"] },
  { code: "YYZ", city: "Toronto", aliases: ["yyz", "toronto", "pearson"] },
  { code: "YUL", city: "Montreal", aliases: ["yul", "montreal", "trudeau"] },
  { code: "YVR", city: "Vancouver", aliases: ["yvr", "vancouver"] },
  { code: "MEX", city: "Cidade do México", aliases: ["mex", "mexico city", "cidade do mexico", "benito juarez", "benito juárez"] },
  { code: "CUN", city: "Cancún", aliases: ["cun", "cancun", "cancún"] },
  { code: "PTY", city: "Cidade do Panamá", aliases: ["pty", "panama city", "cidade do panama", "tocumen"] },
  { code: "BOG", city: "Bogotá", aliases: ["bog", "bogota", "el dorado"] },
  { code: "MDE", city: "Medellín", aliases: ["mde", "medellin", "jose maria cordova", "jose maría cordova"] },
  { code: "UIO", city: "Quito", aliases: ["uio", "quito", "mariscal sucre"] },
  { code: "GYE", city: "Guayaquil", aliases: ["gye", "guayaquil", "jose joaquin de olmedo", "jose joaquín de olmedo"] },
  { code: "SJO", city: "San José", aliases: ["sjo", "san jose", "juan santamaria", "juan santamaría"] },
  { code: "BEL", city: "Belém", aliases: ["bel", "belem", "val de cans", "val de cans julio cesar ribeiro"] },
  { code: "MAO", city: "Manaus", aliases: ["mao", "manaus", "eduardo gomes"] },
  { code: "NAT", city: "Natal", aliases: ["nat", "natal", "sao goncalo do amarante", "são gonçalo do amarante"] },
  { code: "AJU", city: "Aracaju", aliases: ["aju", "aracaju", "santa maria"] },
  { code: "MCZ", city: "Maceió", aliases: ["mcz", "maceio", "zumbi dos palmares"] },
  { code: "JOI", city: "Joinville", aliases: ["joi", "joinville", "lauro carneiro de loyola"] },
];

const CITY_ALIAS_LOOKUP: Record<string, string> = {
  "new york": "Nova Iorque",
  "new york city": "Nova Iorque",
  "nova york": "Nova Iorque",
  "nova iorque": "Nova Iorque",
  "washington dc": "Washington",
  "washington d c": "Washington",
  "washington d.c": "Washington",
  "san francisco": "São Francisco",
  "sao francisco": "São Francisco",
  "mexico city": "Cidade do México",
  "cidade do mexico": "Cidade do México",
  "cidade do panama": "Cidade do Panamá",
  "panama city": "Cidade do Panamá",
  "abu dhabi": "Abu Dhabi",
  "las vegas": "Las Vegas",
  philadelphia: "Filadélfia",
  filadelfia: "Filadélfia",
  bogota: "Bogotá",
  medellin: "Medellín",
  cancun: "Cancún",
  montreal: "Montreal",
  munich: "Munique",
  istanbul: "Istambul",
  tokyo: "Tóquio",
  "sao jose": "San José",
  "san jose": "San José",
  quito: "Quito",
  guayaquil: "Guayaquil",
  belem: "Belém",
  maceio: "Maceió",
  "belo horizonte": "Belo Horizonte",
  "porto alegre": "Porto Alegre",
  curitiba: "Curitiba",
  florianopolis: "Florianópolis",
  amsterdam: "Amsterdã",
  madrid: "Madri",
  lisbon: "Lisboa",
  paris: "Paris",
  rome: "Roma",
  milan: "Milão",
  zurich: "Zurique",
  geneva: "Genebra",
  frankfurt: "Frankfurt",
  dublin: "Dublin",
  singapore: "Singapura",
  london: "Londres",
  "rio de janeiro": "Rio de Janeiro",
  "sao paulo": "São Paulo",
};

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeLine(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeCityLabel(value?: string | null) {
  const raw = normalizeLine(value);
  if (!raw) return "";
  const normalized = normalizeText(raw)
    .replace(/[^a-z0-9.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  const direct = CITY_ALIAS_LOOKUP[normalized];
  if (direct) return direct;
  for (const [alias, city] of Object.entries(CITY_ALIAS_LOOKUP)) {
    if (normalized.includes(alias)) return city;
  }
  return toTitleCase(raw);
}

function normalizeAirportCode(code?: string | null) {
  return normalizeLine(code).toUpperCase();
}

function getCityByAirportCodeLookup(code?: string | null, airportCodeCityLookup: Record<string, string> = {}) {
  const normalizedCode = normalizeAirportCode(code);
  if (!/^[A-Z]{3}$/.test(normalizedCode)) return "";
  const rawCity = normalizeLine(airportCodeCityLookup[normalizedCode]);
  if (!rawCity) return "";
  return normalizeCityLabel(rawCity) || toTitleCase(rawCity);
}

function findAirportAliasByCode(
  code?: string | null,
  runtimeAliases: AirportAliasEntry[] = [],
  airportCodeCityLookup: Record<string, string> = {}
) {
  const normalizedCode = normalizeAirportCode(code);
  if (!/^[A-Z]{3}$/.test(normalizedCode)) return null;
  const runtimeMatch = runtimeAliases.find((item) => item.code === normalizedCode);
  if (runtimeMatch) return runtimeMatch;
  const knownMatch = KNOWN_AIRPORT_ALIASES.find((item) => item.code === normalizedCode);
  if (knownMatch) return knownMatch;
  const lookupCity = getCityByAirportCodeLookup(normalizedCode, airportCodeCityLookup);
  if (!lookupCity) return null;
  return {
    code: normalizedCode,
    city: lookupCity,
    aliases: [normalizedCode],
  };
}

function extractAirportCodeFromLabel(value?: string | null) {
  const raw = normalizeLine(value);
  if (!raw) return "";
  const exact = raw.match(/^[A-Za-z]{3}$/);
  if (exact) return exact[0].toUpperCase();

  const parenthesized = raw.match(/\(([A-Za-z]{3})\)/);
  if (parenthesized?.[1]) return parenthesized[1].toUpperCase();

  const bracketed = raw.match(/\[([A-Za-z]{3})\]/);
  if (bracketed?.[1]) return bracketed[1].toUpperCase();

  const leading = raw.match(/^([A-Za-z]{3})(?:\s*[-/]|$)/);
  if (leading?.[1]) return leading[1].toUpperCase();

  const trailing = raw.match(/(?:[-/]\s*)([A-Za-z]{3})$/);
  if (trailing?.[1]) return trailing[1].toUpperCase();

  return "";
}

function inferCityFromAirportLabel(value?: string | null, airportCode?: string | null) {
  const raw = normalizeLine(value);
  if (!raw) return "";

  const code = normalizeLine(airportCode).toUpperCase();
  let cleaned = raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ");
  if (/^[A-Z]{3}$/.test(code)) {
    cleaned = cleaned.replace(new RegExp(`\\b${code}\\b`, "gi"), " ");
  }
  cleaned = cleaned
    .replace(AIRPORT_NOISE_WORDS_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  const candidates = cleaned
    .split(/\s*[-,/|]\s*/)
    .map((part) =>
      normalizeLine(part)
        .replace(AIRPORT_NOISE_WORDS_RE, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);

  for (const candidate of candidates) {
    const mapped = normalizeCityLabel(candidate);
    const isMapped = mapped !== toTitleCase(candidate);
    if (isMapped) return mapped;
  }

  const firstCandidate = candidates[0] || cleaned.split("-")[0] || cleaned;
  return normalizeCityLabel(firstCandidate);
}

function parseMoney(value?: string | null): number {
  const numeric = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDate(day: number, monthLabel: string, year: number) {
  const monthIndex = MONTH_INDEX[normalizeText(monthLabel)];
  if (monthIndex === undefined) return null;
  const date = new Date(Date.UTC(year, monthIndex, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value?: string | null) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  const date = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractMoneyValues(line?: string | null): number[] {
  return Array.from(String(line || "").matchAll(/(?:R\$|US\$|USD|U\$S|\$)\s*([0-9][0-9.]*,\d{2})/gi))
    .map((match) => parseMoney(match[1]))
    .filter((value) => value > 0);
}

function isTimeLine(line: string) {
  return /^\d{2}:\d{2}$/.test(normalizeLine(line));
}

function isAirportLine(line: string) {
  return /^[A-Z]{3}$/.test(normalizeLine(line));
}

function isFlightTypeLine(line: string) {
  const normalized = normalizeText(line);
  return normalized.includes("voo");
}

function isRefundLine(line: string) {
  return normalizeText(line).includes("reembols");
}

function isOccupancyLine(line: string) {
  return /^total\s*\(/i.test(normalizeText(line));
}

function normalizeTrecho(line: string) {
  const parts = normalizeLine(line)
    .split("-")
    .map((part) => normalizeLine(part))
    .filter(Boolean);
  return parts.slice(0, 2).join(" - ");
}

function reverseTrecho(trecho: string) {
  const parts = trecho
    .split("-")
    .map((part) => normalizeLine(part))
    .filter(Boolean);
  if (parts.length < 2) return trecho;
  return `${parts[1]} - ${parts[0]}`;
}

function toTitleCase(value?: string | null) {
  return String(value || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ")
    .trim();
}

function buildAirportAliasStorageValue(alias: string, code: string, city: string) {
  const aliasValue = normalizeLine(alias);
  const codeValue = normalizeLine(code).toUpperCase();
  const cityValue = normalizeCityLabel(city || codeValue) || codeValue;
  if (!aliasValue || !codeValue) return "";
  return `${aliasValue}|${codeValue}|${cityValue}`;
}

function parseAirportAliasStorageValue(value?: string | null): AirportAliasEntry | null {
  const raw = normalizeLine(value);
  if (!raw) return null;

  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw);
      const alias = normalizeLine(parsed?.alias || "");
      const code = normalizeLine(parsed?.code || "").toUpperCase();
      const city = normalizeCityLabel(parsed?.city || "");
      if (!alias || !code) return null;
      return {
        code,
        city: city || code,
        aliases: [alias],
      };
    } catch {
      // fallback no parser de string simples
    }
  }

  const parts = raw.split("|").map((part) => normalizeLine(part)).filter(Boolean);
  if (parts.length < 3) return null;
  const [alias, code, ...cityParts] = parts;
  const city = normalizeCityLabel(cityParts.join(" "));
  const codeValue = code.toUpperCase();
  if (!alias || !/^[A-Z]{3}$/.test(codeValue)) return null;
  return {
    code: codeValue,
    city: city || codeValue,
    aliases: [alias],
  };
}

function buildRuntimeAirportAliases(aliasValues?: string[] | null) {
  const byCodeCity = new Map<string, AirportAliasEntry>();

  (aliasValues || []).forEach((rawValue) => {
    const parsed = parseAirportAliasStorageValue(rawValue);
    if (!parsed) return;
    const key = `${parsed.code}__${normalizeText(parsed.city || parsed.code)}`;
    const existing = byCodeCity.get(key);
    if (!existing) {
      byCodeCity.set(key, {
        code: parsed.code,
        city: parsed.city || parsed.code,
        aliases: parsed.aliases.map((alias) => normalizeLine(alias)).filter(Boolean),
      });
      return;
    }
    const mergedAliases = new Set<string>([
      ...(existing.aliases || []).map((alias) => normalizeLine(alias)),
      ...(parsed.aliases || []).map((alias) => normalizeLine(alias)),
    ]);
    byCodeCity.set(key, {
      ...existing,
      aliases: Array.from(mergedAliases).filter(Boolean),
    });
  });

  return Array.from(byCodeCity.values());
}

function stripAirlineCodeSuffix(line: string) {
  return normalizeLine(line).replace(/\s*\([A-Z0-9/]{2,8}\)\s*$/i, "").trim();
}

function parseAirline(line: string) {
  const raw = normalizeLine(line).replace(/\s*trecho\s*\d+\s*$/i, "").trim();
  const match = raw.match(/(ida|volta)$/i);
  const direction = match?.[1] ? normalizeText(match[1]) : "";
  const cia = match ? raw.slice(0, raw.length - match[1].length).trim() : raw;
  return { cia_aerea: cia, direction };
}

function parseProvider2Airline(line: string) {
  const cia = stripAirlineCodeSuffix(line);
  return toTitleCase(cia);
}

function parseOccupancy(line: string) {
  const normalized = normalizeText(line);
  const adultsMatch = normalized.match(/(\d+)\s*adult/);
  const childrenMatch = normalized.match(/(\d+)\s*crianc/);
  return {
    qtd_adultos: adultsMatch?.[1] ? Number(adultsMatch[1]) : 0,
    qtd_criancas: childrenMatch?.[1] ? Number(childrenMatch[1]) : 0,
  };
}

function isProviderCardMarkerLine(line: string) {
  const normalized = normalizeText(line);
  return PROVIDER_CARD_MARKERS.has(normalized);
}

function isProviderCardAirlineLine(line: string) {
  const normalized = normalizeLine(line);
  if (!normalized) return false;
  if (!/[a-zA-ZÀ-ÿ]/.test(normalized)) return false;
  if (isTimeLine(normalized) || isAirportLine(normalized) || isOccupancyLine(normalized)) return false;
  if (extractMoneyValues(normalized).length > 0) return false;
  if (isFlightTypeLine(normalized) || isRefundLine(normalized)) return false;
  if (DATE_CLASS_RE.test(normalized) || RANGE_RE.test(normalized) || SINGLE_DAY_RE.test(normalized)) return false;
  return /(ida|volta|trecho\s*\d+)\s*$/i.test(normalized);
}

function isTrechoCandidateLine(line: string) {
  const normalized = normalizeLine(line);
  if (!normalized.includes("-")) return false;
  if (DATE_CLASS_RE.test(normalized)) return false;
  if (RANGE_RE.test(normalized) || SINGLE_DAY_RE.test(normalized)) return false;
  if (isOccupancyLine(normalized) || isFlightTypeLine(normalized)) return false;
  if (extractMoneyValues(normalized).length > 0) return false;
  return true;
}

function sortFlights(list: ImportedRoteiroAereo[]) {
  return list
    .slice()
    .sort((a, b) => {
      const dateCompare = String(a.data_voo || "").localeCompare(String(b.data_voo || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(a.hora_saida || "").localeCompare(String(b.hora_saida || ""));
    })
    .map((item, index) => ({ ...item, ordem: index }));
}

function splitTotalAcrossSegments(total: number, count: number) {
  if (!Number.isFinite(total) || total <= 0 || count <= 1) return Array.from({ length: Math.max(count, 1) }, () => total);
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  let remainder = cents - base * count;
  return Array.from({ length: count }, () => {
    const value = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return value / 100;
  });
}

function isProvider2HeaderLine(line: string) {
  const normalized = normalizeText(line);
  return normalized.includes("cia") && normalized.includes("voo") && normalized.includes("origem") && normalized.includes("destino") && normalized.includes("duracao");
}

function isProvider2AirlineLine(line: string) {
  return /.+\([A-Z0-9/]{2,8}\)$/i.test(normalizeLine(line));
}

function isProvider2FlightNumberLine(line: string) {
  return /^[A-Z0-9]{1,3}\s*\d{1,4}(?:\s*\*)?$/i.test(normalizeLine(line));
}

function isProvider2DateTimeLine(line: string) {
  return PROVIDER2_DATE_TIME_RE.test(normalizeLine(line));
}

function isProvider2DurationLine(line: string) {
  return /^\d{2}:\d{2}$/.test(normalizeLine(line));
}

function isEquipmentLine(line: string) {
  return /^[A-Z0-9]{2,4}$/i.test(normalizeLine(line));
}

function isNumericLine(line: string) {
  return /^\d+$/.test(normalizeLine(line));
}

function isCabinOrClassLine(line: string) {
  const normalized = normalizeText(line);
  return Boolean(
    normalized &&
      (
        normalized.includes("econ") ||
        normalized.includes("econom") ||
        normalized.includes("business") ||
        normalized.includes("execut") ||
        normalized.includes("premium") ||
        normalized.includes("first")
      )
  );
}

function parseProvider2DateTime(line: string) {
  const match = normalizeLine(line).match(PROVIDER2_DATE_TIME_RE);
  if (!match) return null;
  const [, day, month, year, time] = match;
  return {
    date: `${year}-${month}-${day}`,
    time,
  };
}

function formatArrivalTimeWithOffset(departureDate?: string | null, arrivalDate?: string | null, arrivalTime?: string | null) {
  const time = normalizeLine(arrivalTime);
  if (!time) return "";
  const departure = parseIsoDate(departureDate);
  const arrival = parseIsoDate(arrivalDate);
  if (!departure || !arrival) return time;
  const diffDays = Math.round((arrival.getTime() - departure.getTime()) / 86400000);
  if (diffDays <= 0) return time;
  return `${time} (+${diffDays})`;
}

function inferArrivalDateByTimes(departureDate?: string | null, departureTime?: string | null, arrivalTime?: string | null) {
  const date = String(departureDate || "").trim();
  const out = normalizeLine(departureTime);
  const incoming = normalizeLine(arrivalTime);
  if (!date) return "";
  if (!isTimeLine(out) || !isTimeLine(incoming)) return date;

  const outParts = out.split(":").map((part) => Number(part));
  const inParts = incoming.split(":").map((part) => Number(part));
  if (outParts.length !== 2 || inParts.length !== 2) return date;
  if (!Number.isFinite(outParts[0]) || !Number.isFinite(outParts[1]) || !Number.isFinite(inParts[0]) || !Number.isFinite(inParts[1])) {
    return date;
  }

  const outMinutes = outParts[0] * 60 + outParts[1];
  const inMinutes = inParts[0] * 60 + inParts[1];
  if (inMinutes >= outMinutes) return date;

  const base = parseIsoDate(date);
  if (!base) return date;
  base.setUTCDate(base.getUTCDate() + 1);
  return toIsoDate(base);
}

function resolveAirportMatch(
  value?: string | null,
  runtimeAliases: AirportAliasEntry[] = [],
  airportCodeCityLookup: Record<string, string> = {}
) {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const explicitCode = extractAirportCodeFromLabel(value);
  if (explicitCode) {
    const existing = findAirportAliasByCode(explicitCode, runtimeAliases, airportCodeCityLookup);
    const inferredCity = normalizeCityLabel(existing?.city || inferCityFromAirportLabel(value, explicitCode));
    return {
      code: explicitCode,
      city: inferredCity || explicitCode,
    };
  }

  const sources = [...runtimeAliases, ...KNOWN_AIRPORT_ALIASES];
  for (const item of sources) {
    if (item.aliases.some((alias) => normalized.includes(normalizeText(alias)))) {
      return { code: item.code, city: normalizeCityLabel(item.city) || item.city };
    }
  }

  return null;
}

function normalizeAirportField(
  value?: string | null,
  runtimeAliases: AirportAliasEntry[] = [],
  airportCodeCityLookup: Record<string, string> = {}
) {
  const match = resolveAirportMatch(value, runtimeAliases, airportCodeCityLookup);
  if (match?.code) return match.code;
  return normalizeLine(value);
}

function resolveCityFromAirportLabel(
  value?: string | null,
  runtimeAliases: AirportAliasEntry[] = [],
  airportCodeCityLookup: Record<string, string> = {}
) {
  const match = resolveAirportMatch(value, runtimeAliases, airportCodeCityLookup);
  if (match?.city) return normalizeCityLabel(match.city) || match.city;
  const raw = normalizeLine(value);
  if (!raw) return "";
  const inferred = inferCityFromAirportLabel(raw, extractAirportCodeFromLabel(raw));
  if (inferred) return inferred;
  const city = raw.split("-")[0] || raw;
  return normalizeCityLabel(city) || toTitleCase(city);
}

function parseFlightTypeFromStops(value?: string | null) {
  const stops = Number(normalizeLine(value));
  if (!Number.isFinite(stops) || stops < 0) return "";
  if (stops === 0) return "Voo direto";
  if (stops === 1) return "1 escala";
  return `${stops} escalas`;
}

function parseProvider2(
  text: string,
  runtimeAliases: AirportAliasEntry[] = [],
  airportCodeCityLookup: Record<string, string> = {}
) {
  const rawLines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter((line) => Boolean(line) && !["sua escolha", "fechar"].includes(normalizeText(line)));

  const headerIndex = rawLines.findIndex((line) => isProvider2HeaderLine(line));
  if (headerIndex === -1) return [];

  const lines = rawLines.slice(headerIndex + 1);
  if (lines.length < 6) return [];

  let cursor = 0;
  const airlines: string[] = [];
  while (cursor < lines.length && isProvider2AirlineLine(lines[cursor])) {
    airlines.push(lines[cursor]);
    cursor += 1;
  }
  const segmentCount = airlines.length;
  if (segmentCount === 0) return [];

  const takeBlock = (count: number, predicate?: (line: string) => boolean) => {
    const out: string[] = [];
    while (cursor < lines.length && out.length < count) {
      const candidate = lines[cursor];
      if (!candidate) {
        cursor += 1;
        continue;
      }
      if (!predicate || predicate(candidate)) {
        out.push(candidate);
      }
      cursor += 1;
    }
    return out;
  };

  const flightNumbers = takeBlock(segmentCount, isProvider2FlightNumberLine);
  const departures = takeBlock(segmentCount, isProvider2DateTimeLine);
  const arrivals = takeBlock(segmentCount, isProvider2DateTimeLine);
  const origins = takeBlock(segmentCount);
  const destinations = takeBlock(segmentCount);
  const stops = takeBlock(segmentCount, isNumericLine);
  takeBlock(segmentCount, isEquipmentLine); // equipamento
  const durations = takeBlock(segmentCount, isProvider2DurationLine);

  const cabinOrClassValues: string[] = [];
  let reembolsoTipo = "";
  let qtdAdultos = 0;
  let qtdCriancas = 0;
  let taxaTotal = 0;
  let valorTotal = 0;

  while (cursor < lines.length) {
    const line = lines[cursor];
    const normalized = normalizeText(line);
    const moneyValues = extractMoneyValues(line);

    if (moneyValues.length > 0) {
      const value = moneyValues[moneyValues.length - 1] || 0;
      if (normalized.includes("taxa")) {
        taxaTotal = value;
      } else {
        valorTotal = value;
      }
      cursor += 1;
      continue;
    }

    if (isCabinOrClassLine(line) && cabinOrClassValues.length < segmentCount) {
      cabinOrClassValues.push(line);
      cursor += 1;
      continue;
    }

    if (!reembolsoTipo && (normalized.includes("restrict") || normalized.includes("reembols") || normalized.includes("refund"))) {
      reembolsoTipo = line;
      cursor += 1;
      continue;
    }

    if (isNumericLine(line)) {
      const value = Number(line);
      if (value > 0 && value <= 9 && qtdAdultos === 0) {
        qtdAdultos = value;
      } else if (value > 0 && value <= 9 && qtdAdultos > 0 && qtdCriancas === 0) {
        qtdCriancas = value;
      }
      cursor += 1;
      continue;
    }

    cursor += 1;
  }

  if (qtdAdultos > 0 && qtdCriancas > 0 && qtdAdultos === qtdCriancas) {
    qtdCriancas = 0;
  }

  const distributedTotals = splitTotalAcrossSegments(valorTotal, segmentCount);
  const distributedTaxes = splitTotalAcrossSegments(taxaTotal, segmentCount);

  return sortFlights(
    airlines.map((airline, index) => {
      const departure = parseProvider2DateTime(departures[index] || "");
      const arrival = parseProvider2DateTime(arrivals[index] || "");
      const origem = origins[index] || "";
      const destino = destinations[index] || "";
      const cityOut = resolveCityFromAirportLabel(origem, runtimeAliases, airportCodeCityLookup);
      const cityIn = resolveCityFromAirportLabel(destino, runtimeAliases, airportCodeCityLookup);
      return {
        trecho: [cityOut, cityIn].filter(Boolean).join(" - "),
        cia_aerea: parseProvider2Airline(airline),
        data_voo: departure?.date || "",
        data_inicio: departure?.date || "",
        data_fim: arrival?.date || departure?.date || "",
        classe_reserva: cabinOrClassValues[index] || "",
        hora_saida: departure?.time || "",
        aeroporto_saida: normalizeAirportField(origem, runtimeAliases, airportCodeCityLookup),
        duracao_voo: durations[index] || "",
        tipo_voo: parseFlightTypeFromStops(stops[index]),
        hora_chegada: formatArrivalTimeWithOffset(departure?.date, arrival?.date, arrival?.time),
        aeroporto_chegada: normalizeAirportField(destino, runtimeAliases, airportCodeCityLookup),
        tarifa_nome: "",
        reembolso_tipo: reembolsoTipo,
        qtd_adultos: qtdAdultos,
        qtd_criancas: qtdCriancas,
        taxas: distributedTaxes[index] ?? taxaTotal,
        valor_total: distributedTotals[index] ?? valorTotal,
        ordem: index,
      };
    })
  );
}

function parseProviderCards(
  text: string,
  referenceDate: Date,
  runtimeAliases: AirportAliasEntry[] = [],
  airportCodeCityLookup: Record<string, string> = {}
) {
  const rawLines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  if (!rawLines.some((line) => isProviderCardMarkerLine(line))) return [];

  const cards: string[][] = [];
  let currentCard: string[] = [];

  rawLines.forEach((line) => {
    const normalized = normalizeText(line);
    if (normalized === "selecionado") {
      if (currentCard.length > 0) {
        cards.push(currentCard);
        currentCard = [];
      }
      return;
    }
    if (isProviderCardMarkerLine(line)) return;
    currentCard.push(line);
  });
  if (currentCard.length > 0) cards.push(currentCard);

  if (cards.length === 0) {
    const fallback = rawLines.filter((line) => !isProviderCardMarkerLine(line));
    if (fallback.length > 0) cards.push(fallback);
  }

  let lastDate: Date | null = null;
  const imported: ImportedRoteiroAereo[] = [];

  cards.forEach((cardLines) => {
    const lines = cardLines.filter(Boolean);
    if (lines.length < 6) return;

    const firstAirlineIndex = lines.findIndex((line) => isProviderCardAirlineLine(line));
    const trechoCandidate = lines
      .slice(0, firstAirlineIndex > -1 ? firstAirlineIndex : undefined)
      .find((line) => isTrechoCandidateLine(line));
    const trechoBase = trechoCandidate ? normalizeTrecho(trechoCandidate) : "";

    const tarifaNome = lines.find((line) => normalizeText(line).includes("tarifa")) || "";
    const reembolsoTipo = lines.find((line) => isRefundLine(line)) || "";
    const occupancyLine = lines.find((line) => isOccupancyLine(line)) || "";
    const occupancy = occupancyLine ? parseOccupancy(occupancyLine) : { qtd_adultos: 0, qtd_criancas: 0 };

    let cardTaxes = 0;
    let cardTotal = 0;
    lines.forEach((line) => {
      const values = extractMoneyValues(line);
      if (!values.length) return;
      const value = values[values.length - 1] || 0;
      if (normalizeText(line).includes("taxa")) {
        cardTaxes = value;
      } else {
        cardTotal = value;
      }
    });

    const cardSegments: Array<Omit<ImportedRoteiroAereo, "ordem" | "trecho" | "tarifa_nome" | "reembolso_tipo" | "qtd_adultos" | "qtd_criancas" | "taxas" | "valor_total"> & { direction: string }> = [];

    for (let cursor = 0; cursor < lines.length; cursor++) {
      const airlineLine = lines[cursor] || "";
      if (!isProviderCardAirlineLine(airlineLine)) continue;

      const dateClassLine = lines[cursor + 1] || "";
      const departTime = lines[cursor + 2] || "";
      const airportOut = lines[cursor + 3] || "";
      const duration = lines[cursor + 4] || "";
      const flightType = lines[cursor + 5] || "";
      const arrivalTime = lines[cursor + 6] || "";
      const airportIn = lines[cursor + 7] || "";

      const dateClassMatch = dateClassLine.match(DATE_CLASS_RE);
      const airportOutResolved = Boolean(
        isAirportLine(airportOut) || resolveAirportMatch(airportOut, runtimeAliases, airportCodeCityLookup)
      );
      const airportInResolved = Boolean(
        isAirportLine(airportIn) || resolveAirportMatch(airportIn, runtimeAliases, airportCodeCityLookup)
      );
      if (
        !dateClassMatch ||
        !isTimeLine(departTime) ||
        !airportOutResolved ||
        !isTimeLine(arrivalTime) ||
        !airportInResolved
      ) {
        continue;
      }

      let date = parseDate(Number(dateClassMatch[1]), dateClassMatch[2], referenceDate.getFullYear());
      if (date && lastDate && date.getTime() < lastDate.getTime()) {
        date = parseDate(Number(dateClassMatch[1]), dateClassMatch[2], referenceDate.getFullYear() + 1);
      }
      if (!date) continue;
      lastDate = date;

      const airline = parseAirline(airlineLine);
      const dataInicio = toIsoDate(date);
      const dataFim = inferArrivalDateByTimes(dataInicio, departTime, arrivalTime);
      cardSegments.push({
        direction: airline.direction,
        cia_aerea: airline.cia_aerea,
        data_voo: dataInicio,
        data_inicio: dataInicio,
        data_fim: dataFim || dataInicio,
        classe_reserva: normalizeLine(dateClassMatch[3] || ""),
        hora_saida: normalizeLine(departTime),
        aeroporto_saida: normalizeAirportField(airportOut, runtimeAliases, airportCodeCityLookup),
        duracao_voo: normalizeLine(duration),
        tipo_voo: normalizeLine(flightType),
        hora_chegada: formatArrivalTimeWithOffset(dataInicio, dataFim || dataInicio, arrivalTime),
        aeroporto_chegada: normalizeAirportField(airportIn, runtimeAliases, airportCodeCityLookup),
      });

      cursor += 7;
    }

    if (cardSegments.length === 0) return;

    const distributedTotals = splitTotalAcrossSegments(cardTotal, cardSegments.length);
    const distributedTaxes = splitTotalAcrossSegments(cardTaxes, cardSegments.length);

    cardSegments.forEach((segment, index) => {
      const cityOut = resolveCityFromAirportLabel(segment.aeroporto_saida, runtimeAliases, airportCodeCityLookup);
      const cityIn = resolveCityFromAirportLabel(segment.aeroporto_chegada, runtimeAliases, airportCodeCityLookup);
      const fallbackTrecho = [cityOut, cityIn].filter(Boolean).join(" - ");

      const trechoResolved = (() => {
        if (!trechoBase) return fallbackTrecho;
        if (segment.direction === "volta") return reverseTrecho(trechoBase);
        if (segment.direction === "ida") return trechoBase;
        if (cardSegments.length === 1) return trechoBase;
        return fallbackTrecho || trechoBase;
      })();

      imported.push({
        trecho: trechoResolved,
        cia_aerea: segment.cia_aerea,
        data_voo: segment.data_voo,
        data_inicio: segment.data_inicio,
        data_fim: segment.data_fim,
        classe_reserva: segment.classe_reserva,
        hora_saida: segment.hora_saida,
        aeroporto_saida: segment.aeroporto_saida,
        duracao_voo: segment.duracao_voo,
        tipo_voo: segment.tipo_voo,
        hora_chegada: segment.hora_chegada,
        aeroporto_chegada: segment.aeroporto_chegada,
        tarifa_nome: tarifaNome,
        reembolso_tipo: reembolsoTipo,
        qtd_adultos: occupancy.qtd_adultos,
        qtd_criancas: occupancy.qtd_criancas,
        taxas: distributedTaxes[index] ?? cardTaxes,
        valor_total: distributedTotals[index] ?? cardTotal,
        ordem: imported.length,
      });
    });
  });

  return sortFlights(imported);
}

function collectProvider2AliasValues(
  text: string,
  runtimeAliases: AirportAliasEntry[] = [],
  airportCodeCityLookup: Record<string, string> = {}
) {
  const rawLines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter((line) => Boolean(line) && !["sua escolha", "fechar"].includes(normalizeText(line)));

  const headerIndex = rawLines.findIndex((line) => isProvider2HeaderLine(line));
  if (headerIndex === -1) return [];

  const lines = rawLines.slice(headerIndex + 1);
  if (lines.length < 6) return [];

  let cursor = 0;
  const airlines: string[] = [];
  while (cursor < lines.length && isProvider2AirlineLine(lines[cursor])) {
    airlines.push(lines[cursor]);
    cursor += 1;
  }
  const segmentCount = airlines.length;
  if (segmentCount === 0) return [];

  const takeBlock = (count: number, predicate?: (line: string) => boolean) => {
    const out: string[] = [];
    while (cursor < lines.length && out.length < count) {
      const candidate = lines[cursor];
      if (!candidate) {
        cursor += 1;
        continue;
      }
      if (!predicate || predicate(candidate)) {
        out.push(candidate);
      }
      cursor += 1;
    }
    return out;
  };

  takeBlock(segmentCount, isProvider2FlightNumberLine);
  takeBlock(segmentCount, isProvider2DateTimeLine);
  takeBlock(segmentCount, isProvider2DateTimeLine);
  const origins = takeBlock(segmentCount);
  const destinations = takeBlock(segmentCount);

  const aliases = new Set<string>();
  [...origins, ...destinations].forEach((label) => {
    const normalizedLabel = normalizeLine(label);
    if (!normalizedLabel || isAirportLine(normalizedLabel)) return;
    const resolved = resolveAirportMatch(normalizedLabel, runtimeAliases, airportCodeCityLookup);
    if (!resolved?.code) return;
    const storageValue = buildAirportAliasStorageValue(normalizedLabel, resolved.code, resolved.city);
    if (!storageValue) return;
    aliases.add(storageValue);
  });

  return Array.from(aliases);
}

function collectProviderCardAliasValues(
  text: string,
  runtimeAliases: AirportAliasEntry[] = [],
  airportCodeCityLookup: Record<string, string> = {}
) {
  const rawLines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  if (!rawLines.some((line) => isProviderCardMarkerLine(line))) return [];

  const cards: string[][] = [];
  let currentCard: string[] = [];

  rawLines.forEach((line) => {
    const normalized = normalizeText(line);
    if (normalized === "selecionado") {
      if (currentCard.length > 0) {
        cards.push(currentCard);
        currentCard = [];
      }
      return;
    }
    if (isProviderCardMarkerLine(line)) return;
    currentCard.push(line);
  });
  if (currentCard.length > 0) cards.push(currentCard);

  const aliases = new Set<string>();
  cards.forEach((cardLines) => {
    const lines = cardLines.filter(Boolean);
    for (let cursor = 0; cursor < lines.length; cursor++) {
      const airlineLine = lines[cursor] || "";
      if (!isProviderCardAirlineLine(airlineLine)) continue;

      const airportOut = lines[cursor + 3] || "";
      const airportIn = lines[cursor + 7] || "";
      [airportOut, airportIn].forEach((label) => {
        const normalizedLabel = normalizeLine(label);
        if (!normalizedLabel || isAirportLine(normalizedLabel)) return;
        const resolved = resolveAirportMatch(normalizedLabel, runtimeAliases, airportCodeCityLookup);
        if (!resolved?.code) return;
        const storageValue = buildAirportAliasStorageValue(normalizedLabel, resolved.code, resolved.city);
        if (!storageValue) return;
        aliases.add(storageValue);
      });
    }
  });

  return Array.from(aliases);
}

export function collectImportedRoteiroAereoAliasValues(
  text: string,
  options: ParseImportedRoteiroAereoOptions = {}
) {
  const runtimeAliases = buildRuntimeAirportAliases(options.airportAliasValues);
  const airportCodeCityLookup = options.airportCodeCityLookup || {};
  const aliases = new Set<string>([
    ...collectProvider2AliasValues(text, runtimeAliases, airportCodeCityLookup),
    ...collectProviderCardAliasValues(text, runtimeAliases, airportCodeCityLookup),
  ]);
  return Array.from(aliases);
}

export function parseImportedRoteiroAereo(
  text: string,
  referenceDate = new Date(),
  options: ParseImportedRoteiroAereoOptions = {}
) {
  const runtimeAliases = buildRuntimeAirportAliases(options.airportAliasValues);
  const airportCodeCityLookup = options.airportCodeCityLookup || {};
  const provider2 = parseProvider2(text, runtimeAliases, airportCodeCityLookup);
  if (provider2.length > 0) return provider2;

  const providerCards = parseProviderCards(text, referenceDate, runtimeAliases, airportCodeCityLookup);
  if (providerCards.length > 0) return providerCards;

  const lines = String(text || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalizeLine(line))
    .filter((line) => Boolean(line) && !isProviderCardMarkerLine(line));

  if (lines.length < 10) return [];

  let cursor = 0;
  if (RANGE_RE.test(lines[0] || "")) cursor += 1;

  const trechoBase = normalizeTrecho(lines[cursor] || "");
  if (!trechoBase) return [];
  cursor += 1;

  const out: ImportedRoteiroAereo[] = [];
  let lastDate: Date | null = null;

  while (cursor < lines.length) {
    const airlineLine = lines[cursor] || "";
    if (!airlineLine || isOccupancyLine(airlineLine) || extractMoneyValues(airlineLine).length > 0) break;

    const airline = parseAirline(airlineLine);
    const dateClassLine = lines[cursor + 1] || "";
    const departTime = lines[cursor + 2] || "";
    const airportOut = lines[cursor + 3] || "";
    const duration = lines[cursor + 4] || "";
    const flightType = lines[cursor + 5] || "";
    const arrivalTime = lines[cursor + 6] || "";
    const airportIn = lines[cursor + 7] || "";

    const dateClassMatch = dateClassLine.match(DATE_CLASS_RE);
    if (!airline.cia_aerea || !dateClassMatch || !isTimeLine(departTime) || !isAirportLine(airportOut) || !isTimeLine(arrivalTime) || !isAirportLine(airportIn)) {
      break;
    }

    let date = parseDate(Number(dateClassMatch[1]), dateClassMatch[2], referenceDate.getFullYear());
    if (date && lastDate && date.getTime() < lastDate.getTime()) {
      date = parseDate(Number(dateClassMatch[1]), dateClassMatch[2], referenceDate.getFullYear() + 1);
    }
    if (!date) break;
    lastDate = date;

    out.push({
      trecho: airline.direction === "volta" ? reverseTrecho(trechoBase) : trechoBase,
      cia_aerea: airline.cia_aerea,
      data_voo: toIsoDate(date),
      data_inicio: toIsoDate(date),
      data_fim: toIsoDate(date),
      classe_reserva: normalizeLine(dateClassMatch[3] || ""),
      hora_saida: departTime,
      aeroporto_saida: airportOut,
      duracao_voo: normalizeLine(duration),
      tipo_voo: normalizeLine(flightType),
      hora_chegada: arrivalTime,
      aeroporto_chegada: airportIn,
      tarifa_nome: "",
      reembolso_tipo: "",
      qtd_adultos: 0,
      qtd_criancas: 0,
      taxas: 0,
      valor_total: 0,
      ordem: out.length,
    });

    cursor += 8;
  }

  let tarifa_nome = "";
  let reembolso_tipo = "";
  let qtd_adultos = 0;
  let qtd_criancas = 0;
  let taxas = 0;
  let valor_total = 0;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line) {
      cursor += 1;
      continue;
    }
    if (!tarifa_nome && !isRefundLine(line) && !isOccupancyLine(line) && extractMoneyValues(line).length === 0) {
      tarifa_nome = line;
      cursor += 1;
      continue;
    }
    if (!reembolso_tipo && isRefundLine(line)) {
      reembolso_tipo = line;
      cursor += 1;
      continue;
    }
    if (isOccupancyLine(line)) {
      const occupancy = parseOccupancy(line);
      qtd_adultos = occupancy.qtd_adultos;
      qtd_criancas = occupancy.qtd_criancas;
      cursor += 1;
      continue;
    }
    const values = extractMoneyValues(line);
    if (values.length > 0) {
      const normalized = normalizeText(line);
      if (normalized.includes("taxa")) {
        taxas = values[values.length - 1] || taxas;
      } else {
        valor_total = values[values.length - 1] || valor_total;
      }
    }
    cursor += 1;
  }

  const distributedTotals = splitTotalAcrossSegments(valor_total, out.length);

  return sortFlights(
    out.map((item, index) => ({
      ...item,
      tarifa_nome,
      reembolso_tipo,
      qtd_adultos,
      qtd_criancas,
      taxas,
      valor_total: distributedTotals[index] ?? valor_total,
    }))
  );
}

export function mergeImportedRoteiroAereo(existing: ImportedRoteiroAereo[], imported: ImportedRoteiroAereo[]) {
  const meaningfulExisting = (existing || []).filter((item) =>
    Boolean(
      String(item.trecho || "").trim() ||
        String(item.cia_aerea || "").trim() ||
        String(item.data_voo || "").trim() ||
        String(item.hora_saida || "").trim() ||
        String(item.aeroporto_saida || "").trim() ||
        String(item.hora_chegada || "").trim() ||
        String(item.aeroporto_chegada || "").trim() ||
        Number(item.valor_total || 0) > 0
    )
  );

  return sortFlights([...(meaningfulExisting || []), ...(imported || [])]);
}
