import { isSeguroPasseioLike } from "./roteiroSeguro";

export type ItineraryHotelInput = {
  cidade?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  regime?: string | null;
  ordem?: number | null;
};

export type ItineraryPasseioInput = {
  cidade?: string | null;
  passeio?: string | null;
  tipo?: string | null;
  fornecedor?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
  ordem?: number | null;
};

export type ItineraryTransportInput = {
  trecho?: string | null;
  data_voo?: string | null;
  data_inicio?: string | null;
  hora_saida?: string | null;
  ordem?: number | null;
};

export type ItineraryTransferCity = {
  cidade: string;
  chegada: boolean;
  saida: boolean;
};

export type ItineraryGeneratedDay = {
  data: string;
  percurso: string;
  cidade: string;
  descricao: string;
  ordem: number;
};

type DraftDay = {
  data: string;
  percurso: string;
  cidade: string;
  isMoveDay: boolean;
};

type HotelBlock = {
  cidade: string;
  dataInicio: string;
  dataFim: string;
  regime: string;
  ordem: number;
};

function textValue(value?: string | null) {
  return String(value || "").trim();
}

function normalizeText(value?: string | null) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function formatBudgetItemText(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return "";
  const lowerWords = new Set([
    "a",
    "à",
    "ao",
    "aos",
    "as",
    "às",
    "com",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "na",
    "nas",
    "no",
    "nos",
    "o",
    "os",
    "ou",
    "para",
    "por",
    "sem",
    "um",
    "uma",
    "uns",
    "umas",
  ]);
  let seenWord = false;
  return raw
    .split(/(\s+|\/|-|\(|\)|,|\+)/)
    .map((part) => {
      if (!part || /^(\s+|\/|-|\(|\)|,|\+)$/.test(part)) return part;
      if (/^[A-Z0-9]{2,4}$/.test(part)) return part;
      if (/^\d+$/.test(part)) return part;
      const lower = part.toLowerCase();
      const shouldLower = seenWord && lowerWords.has(lower);
      seenWord = true;
      if (shouldLower) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

function toUtcDateOrNull(value?: string | null) {
  const v = textValue(value);
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addUtcDays(date: Date, days: number) {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function toISODateUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

function splitTrechoCities(trecho?: string | null) {
  const parts = String(trecho || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    origem: parts[0] || "",
    destino: parts[parts.length - 1] || parts[0] || "",
  };
}

function regimeSentence(regime?: string | null) {
  const raw = textValue(regime);
  const normalized = normalizeText(regime);
  if (!raw || normalized.includes("sem refeicao")) return "";
  if (normalized.includes("cafe da manha")) return "Café da manhã no hotel.";
  if (normalized.includes("meia pensao")) return "Meia pensão no hotel.";
  if (normalized.includes("pensao completa")) return "Pensão completa no hotel.";
  if (normalized.includes("all inclusive")) return "All inclusive no hotel.";
  return `${formatBudgetItemText(raw)} no hotel.`;
}

function isTransferLikeText(value?: string | null) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return (
    normalized.includes("transfer") ||
    normalized.includes("traslado") ||
    normalized.includes("transporte compartilhado") ||
    normalized.includes("aeroporto") ||
    normalized.includes("in/out") ||
    normalized.includes("in e out") ||
    normalized.includes("retorno para o aeroporto") ||
    normalized.includes("do hotel para o aeroporto") ||
    normalized.includes("para o hotel")
  );
}

function cleanupActivity(value?: string | null) {
  return formatBudgetItemText(textValue(value).replace(/\.+$/, ""));
}

function extractPasseioActivities(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return [];

  const chunks = raw
    .split(/\s*\+\s*/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (chunks.length > 1) {
    return chunks
      .map(cleanupActivity)
      .filter((part) => part && !isTransferLikeText(part))
      .filter((part, index, arr) => arr.findIndex((candidate) => normalizeText(candidate) === normalizeText(part)) === index);
  }

  if (isTransferLikeText(raw)) return [];
  return [cleanupActivity(raw)].filter(Boolean);
}

function isComboPasseio(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return false;
  const activities = extractPasseioActivities(raw);
  return raw.includes("+") || (activities.length >= 1 && isTransferLikeText(raw));
}

function buildHotelBlocks(hoteis: ItineraryHotelInput[]) {
  return (hoteis || [])
    .map((hotel, index) => ({
      cidade: textValue(hotel.cidade),
      dataInicio: textValue(hotel.data_inicio),
      dataFim: textValue(hotel.data_fim),
      regime: textValue(hotel.regime),
      ordem: Number.isFinite(Number(hotel.ordem)) ? Number(hotel.ordem) : index,
    }))
    .filter((hotel) => hotel.cidade && hotel.dataInicio && hotel.dataFim)
    .sort((a, b) => {
      const da = toUtcDateOrNull(a.dataInicio);
      const db = toUtcDateOrNull(b.dataInicio);
      if ((da?.getTime() ?? 0) !== (db?.getTime() ?? 0)) return (da?.getTime() ?? 0) - (db?.getTime() ?? 0);
      return a.ordem - b.ordem;
    });
}

function findHotelForStay(blocks: HotelBlock[], city: string, dateIso: string) {
  return blocks.find((block) => {
    if (normalizeText(block.cidade) !== normalizeText(city)) return false;
    return dateIso >= block.dataInicio && dateIso < block.dataFim;
  });
}

function findHotelForDeparture(blocks: HotelBlock[], city: string, dateIso: string) {
  return blocks.find((block) => {
    if (normalizeText(block.cidade) !== normalizeText(city)) return false;
    return dateIso >= block.dataInicio && dateIso <= block.dataFim;
  });
}

function buildTransferMap(items?: ItineraryTransferCity[] | null) {
  const map = new Map<string, ItineraryTransferCity>();
  (items || []).forEach((item) => {
    const cidade = textValue(item?.cidade);
    if (!cidade) return;
    map.set(normalizeText(cidade), {
      cidade,
      chegada: Boolean(item?.chegada),
      saida: Boolean(item?.saida),
    });
  });
  return map;
}

function ensureSentence(value: string) {
  const trimmed = textValue(value);
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function isSameCity(a?: string | null, b?: string | null) {
  return Boolean(normalizeText(a) && normalizeText(a) === normalizeText(b));
}

function buildSkeletonDays(params: {
  inicioCidade?: string | null;
  fimCidade?: string | null;
  hoteis: ItineraryHotelInput[];
  passeios: ItineraryPasseioInput[];
  transportes: ItineraryTransportInput[];
}) {
  const byDate = new Map<string, DraftDay>();
  const hotelBlocks = buildHotelBlocks(params.hoteis);
  const getOrCreateDay = (dateIso: string) => {
    if (!byDate.has(dateIso)) {
      byDate.set(dateIso, {
        data: dateIso,
        percurso: "",
        cidade: "",
        isMoveDay: false,
      });
    }
    return byDate.get(dateIso)!;
  };

  let previousCity = "";
  hotelBlocks.forEach((block, index) => {
    const start = toUtcDateOrNull(block.dataInicio);
    const end = toUtcDateOrNull(block.dataFim);
    if (!start || !end) return;

    const fromCity = index === 0 ? textValue(params.inicioCidade) : previousCity;
    let cursor = start;
    let dayIndex = 0;
    while (cursor.getTime() < end.getTime()) {
      const iso = toISODateUTC(cursor);
      const day = getOrCreateDay(iso);
      day.cidade = block.cidade;
      if (dayIndex === 0) {
        day.percurso = fromCity && !isSameCity(fromCity, block.cidade) ? `${fromCity} - ${block.cidade}` : block.cidade;
      } else if (!day.percurso) {
        day.percurso = block.cidade;
      }
      cursor = addUtcDays(cursor, 1);
      dayIndex += 1;
      if (dayIndex > 90) break;
    }

    previousCity = block.cidade;
  });

  const sortedTransportes = (params.transportes || [])
    .map((item, index) => ({
      trecho: textValue(item.trecho),
      data: textValue(item.data_voo || item.data_inicio),
      hora_saida: textValue(item.hora_saida),
      ordem: Number.isFinite(Number(item.ordem)) ? Number(item.ordem) : index,
    }))
    .filter((item) => item.data)
    .sort((a, b) => {
      const dateCompare = a.data.localeCompare(b.data);
      if (dateCompare !== 0) return dateCompare;
      if (a.hora_saida !== b.hora_saida) return a.hora_saida.localeCompare(b.hora_saida);
      return a.ordem - b.ordem;
    });

  const groupedTransportes = new Map<string, typeof sortedTransportes>();
  sortedTransportes.forEach((item) => {
    if (!groupedTransportes.has(item.data)) groupedTransportes.set(item.data, []);
    groupedTransportes.get(item.data)!.push(item);
  });

  groupedTransportes.forEach((items, dateIso) => {
    const day = getOrCreateDay(dateIso);
    const first = splitTrechoCities(items[0]?.trecho);
    const last = splitTrechoCities(items[items.length - 1]?.trecho);
    const origem = first.origem;
    const destino = last.destino;
    if (origem || destino) {
      day.percurso = origem && destino && !isSameCity(origem, destino) ? `${origem} - ${destino}` : destino || origem || day.percurso;
      day.cidade = destino || day.cidade || origem;
      day.isMoveDay = Boolean(origem && destino && !isSameCity(origem, destino));
    }
  });

  const lastHotel = hotelBlocks[hotelBlocks.length - 1];
  const fallbackFimCidade = textValue(params.fimCidade);
  if (lastHotel && fallbackFimCidade && !isSameCity(lastHotel.cidade, fallbackFimCidade)) {
    const finalDay = getOrCreateDay(lastHotel.dataFim);
    if (!finalDay.percurso) {
      finalDay.percurso = `${lastHotel.cidade} - ${fallbackFimCidade}`;
      finalDay.cidade = fallbackFimCidade;
      finalDay.isMoveDay = true;
    }
  }

  (params.passeios || []).forEach((passeio) => {
    if (isSeguroPasseioLike(passeio)) return;
    const dateIso = textValue(passeio.data_inicio || passeio.data_fim);
    const cidade = textValue(passeio.cidade);
    if (!dateIso) return;
    const day = getOrCreateDay(dateIso);
    if (!day.cidade && cidade) day.cidade = cidade;
    if (!day.percurso && cidade) day.percurso = cidade;
  });

  const ordered = Array.from(byDate.values()).sort((a, b) => a.data.localeCompare(b.data));
  let lastKnownCity = "";
  ordered.forEach((day) => {
    const { origem, destino } = splitTrechoCities(day.percurso);
    const move = origem && destino && !isSameCity(origem, destino);
    day.isMoveDay = move || day.isMoveDay;
    if (!day.cidade) {
      day.cidade = destino || origem || lastKnownCity;
    }
    if (!day.percurso) {
      day.percurso = day.cidade || lastKnownCity;
    }
    if (day.cidade) lastKnownCity = day.cidade;
  });

  return { ordered, hotelBlocks };
}

export function buildItineraryTransferCities(params: {
  inicioCidade?: string | null;
  fimCidade?: string | null;
  hoteis: ItineraryHotelInput[];
  passeios: ItineraryPasseioInput[];
  transportes: ItineraryTransportInput[];
}) {
  const seen = new Set<string>();
  const cities: string[] = [];
  const addCity = (value?: string | null) => {
    const cidade = formatBudgetItemText(value);
    if (!cidade) return;
    const key = normalizeText(cidade);
    if (seen.has(key)) return;
    seen.add(key);
    cities.push(cidade);
  };

  const hotelCities = buildHotelBlocks(params.hoteis).map((hotel) => hotel.cidade);
  hotelCities.forEach((cidade) => addCity(cidade));

  // Fallback: se ainda não houver hotéis, usamos as cidades já presentes
  // em passeios/serviços para não deixar a configuração vazia.
  if (cities.length === 0) {
    (params.passeios || [])
      .filter((item) => !isSeguroPasseioLike(item))
      .forEach((item) => addCity(item.cidade));
  }

  return cities;
}

export function generateAutomaticRoteiroDias(params: {
  inicioCidade?: string | null;
  fimCidade?: string | null;
  hoteis: ItineraryHotelInput[];
  passeios: ItineraryPasseioInput[];
  transportes: ItineraryTransportInput[];
  transferConfig?: ItineraryTransferCity[] | null;
}) {
  const { ordered, hotelBlocks } = buildSkeletonDays(params);
  const transfers = buildTransferMap(params.transferConfig);
  const explicitActivities = new Map<string, string[]>();
  const queuedActivities = new Map<string, string[]>();

  const addExplicit = (dateIso: string, city: string, activity: string) => {
    const key = `${dateIso}__${normalizeText(city)}`;
    if (!explicitActivities.has(key)) explicitActivities.set(key, []);
    explicitActivities.get(key)!.push(activity);
  };

  const addQueued = (city: string, activity: string) => {
    const key = normalizeText(city);
    if (!queuedActivities.has(key)) queuedActivities.set(key, []);
    queuedActivities.get(key)!.push(activity);
  };

  const sortedPasseios = (params.passeios || [])
    .map((item, index) => ({
      cidade: textValue(item.cidade),
      passeio: textValue(item.passeio),
      tipo: textValue(item.tipo),
      fornecedor: textValue(item.fornecedor),
      data: textValue(item.data_inicio || item.data_fim),
      ordem: Number.isFinite(Number(item.ordem)) ? Number(item.ordem) : index,
    }))
    .filter((item) => item.passeio && item.cidade && !isSeguroPasseioLike(item))
    .sort((a, b) => {
      const dateCompare = a.data.localeCompare(b.data);
      if (dateCompare !== 0) return dateCompare;
      return a.ordem - b.ordem;
    });

  sortedPasseios.forEach((item) => {
    const activities = extractPasseioActivities(item.passeio);
    if (activities.length === 0) return;

    const targetDay = ordered.find((day) => day.data === item.data && isSameCity(day.cidade, item.cidade));
    const shouldQueue = isComboPasseio(item.passeio) || !targetDay || targetDay.isMoveDay;

    if (shouldQueue) {
      activities.forEach((activity) => addQueued(item.cidade, activity));
      return;
    }

    addExplicit(item.data, item.cidade, activities[0]);
  });

  const assignedActivities = new Map<string, string[]>();
  const addAssignedActivity = (day: DraftDay, activity: string) => {
    const key = `${day.data}__${normalizeText(day.cidade)}`;
    if (!assignedActivities.has(key)) assignedActivities.set(key, []);
    assignedActivities.get(key)!.push(activity);
  };

  explicitActivities.forEach((activities, key) => {
    assignedActivities.set(key, [...activities]);
  });

  queuedActivities.forEach((activities, cityKey) => {
    const candidates = ordered.filter((day) => normalizeText(day.cidade) === cityKey && !day.isMoveDay);
    const freeCandidates = candidates.filter((day) => {
      const key = `${day.data}__${normalizeText(day.cidade)}`;
      return !(assignedActivities.get(key)?.length);
    });

    activities.forEach((activity) => {
      const target = freeCandidates.shift() || candidates[candidates.length - 1];
      if (!target) return;
      addAssignedActivity(target, activity);
    });
  });

  return ordered.map((day, index) => {
    const { origem, destino } = splitTrechoCities(day.percurso);
    const isMoveDay = day.isMoveDay || Boolean(origem && destino && !isSameCity(origem, destino));
    const isLastDay = index === ordered.length - 1;
    const currentCity = formatBudgetItemText(day.cidade);
    const routeOrigin = formatBudgetItemText(origem);
    const routeDestination = formatBudgetItemText(destino);
    const transferOrigin = transfers.get(normalizeText(routeOrigin));
    const transferDestination = transfers.get(normalizeText(routeDestination || currentCity));
    const breakfastHotel = isMoveDay
      ? findHotelForDeparture(hotelBlocks, routeOrigin, day.data)
      : findHotelForStay(hotelBlocks, day.cidade, day.data);
    const breakfast = regimeSentence(breakfastHotel?.regime);
    const activitiesKey = `${day.data}__${normalizeText(day.cidade)}`;
    const activities = (assignedActivities.get(activitiesKey) || []).map((activity) => cleanupActivity(activity)).filter(Boolean);
    const descriptionParts: string[] = [];

    if (isMoveDay) {
      if (breakfast) descriptionParts.push(breakfast);

      if (index === 0) {
        if (transferDestination?.chegada) {
          descriptionParts.push("Chegada.");
          descriptionParts.push("Traslado ao hotel.");
        } else {
          descriptionParts.push("Chegada ao hotel.");
        }
        descriptionParts.push(isLastDay ? "Fim de nossos serviços." : "Pernoite.");
      } else {
        if (transferOrigin?.saida) {
          descriptionParts.push(`Traslado ao aeroporto para embarcar com destino a ${routeDestination || currentCity}.`);
        } else {
          descriptionParts.push(`Embarque com destino a ${routeDestination || currentCity}.`);
        }

        if (isLastDay) {
          descriptionParts.push("Chegada, e fim de nossos serviços.");
        } else {
          descriptionParts.push(transferDestination?.chegada ? "Chegada, traslado ao hotel." : "Chegada ao hotel.");
          descriptionParts.push("Pernoite.");
        }
      }
    } else {
      if (breakfast) descriptionParts.push(breakfast);
      if (activities.length > 0) {
        activities.forEach((activity) => {
          descriptionParts.push(`Faremos um ${activity}.`);
        });
        descriptionParts.push("Retorno ao hotel.");
        descriptionParts.push("Pernoite.");
      } else {
        descriptionParts.push("Dia livre.");
        descriptionParts.push("Pernoite.");
      }
    }

    return {
      data: day.data,
      percurso: formatBudgetItemText(day.percurso),
      cidade: currentCity,
      descricao: descriptionParts.map(ensureSentence).filter(Boolean).join(" "),
      ordem: index,
    } satisfies ItineraryGeneratedDay;
  });
}
