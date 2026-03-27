import { supabaseBrowser } from "../supabase-browser";
import type { QuotePdfItem } from "./quotePdf";
import { buildQuotePreviewHtml, exportQuoteToPdf } from "./quotePdfModern";
import { exportRoteiroPdf } from "./roteiroPdfModern";
import type { RoteiroParaPdf, RoteiroHotelPdf, RoteiroPasseioPdf, RoteiroTransportePdf } from "./roteiroPdf";

type QuoteItemRecord = QuotePdfItem & {
  quote_item_segment?: Array<{
    id?: string;
    segment_type: string;
    data: Record<string, unknown>;
    order_index?: number | null;
  }> | null;
  cidade_id?: string | null;
  cidade?: { id: string; nome?: string | null } | null;
};

type ExportArgs = {
  quoteId: string;
  showItemValues?: boolean;
  showSummary?: boolean;
  discount?: number;
  action?: "download" | "preview" | "blob-url";
};

type PreviewArgs = {
  quoteId: string;
  showItemValues?: boolean;
  showSummary?: boolean;
  discount?: number;
};

type ItemRawImport = {
  hotel_import?: {
    cidade?: string;
    hotel?: string;
    endereco?: string;
    data_inicio?: string;
    data_fim?: string;
    noites?: number;
    apto?: string;
    regime?: string;
    tipo_tarifa?: string;
  };
  passeio_import?: {
    cidade?: string;
    passeio?: string;
    fornecedor?: string;
    data_inicio?: string;
    data_fim?: string;
    ingressos?: string;
    tipo?: string;
  };
  aereo_import?: {
    trecho?: string;
    cia_aerea?: string;
    data_inicio?: string;
    data_fim?: string;
    data_voo?: string;
    hora_saida?: string;
    hora_chegada?: string;
    aeroporto_saida?: string;
    aeroporto_chegada?: string;
    cidade_saida?: string;
    cidade_chegada?: string;
    classe_reserva?: string;
    tipo_voo?: string;
    duracao_voo?: string;
    tipo_tarifa?: string;
    segmentos?: Array<{
      ordem?: number;
      data_voo?: string;
      data_chegada?: string;
      hora_saida?: string;
      hora_chegada?: string;
      aeroporto_saida?: string;
      aeroporto_chegada?: string;
      cidade_saida?: string;
      cidade_chegada?: string;
      numero_voo?: string;
      duracao_voo?: string;
      tipo_voo?: string;
    }>;
  };
  flight_details?: {
    airline?: string;
    route?: string;
    cabin?: string;
    directions?: Array<{
      date?: string;
      legs?: Array<{
        departure_time?: string;
        arrival_time?: string;
        departure_code?: string;
        arrival_code?: string;
        departure_city?: string;
        arrival_city?: string;
        duration?: string;
        flight_type?: string;
      }>;
    }>;
  };
};

function textValue(value?: string | null) {
  return String(value || "").trim();
}

function normalizeType(value?: string | null) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function itemLookupText(item: QuotePdfItem) {
  const raw = (item.raw || {}) as ItemRawImport & { format?: string; tipo?: string };
  return normalizeType(
    [
      item.item_type,
      item.title,
      item.product_name,
      item.city_name,
      raw.format,
      raw.tipo,
      raw.hotel_import?.cidade,
      raw.hotel_import?.hotel,
      raw.passeio_import?.cidade,
      raw.passeio_import?.passeio,
      raw.aereo_import?.trecho,
      raw.aereo_import?.cia_aerea,
      raw.flight_details?.route,
      raw.flight_details?.airline,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function parseDirectionDateToIso(dateText?: string | null) {
  const normalized = textValue(dateText).toLowerCase();
  if (!normalized) return "";
  const monthMap: Record<string, number> = {
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
  const match = normalized.match(/(\d{1,2})\s*de\s*([a-zçãõáéíóú]+)/i);
  if (!match) return "";
  const day = Number(match[1]);
  const month = monthMap[match[2]];
  if (!day || month === undefined) return "";
  const year = new Date().getFullYear();
  const date = new Date(Date.UTC(year, month, day));
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parseIsoDateSafe(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return null;
  const date = new Date(`${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLong(value?: string | Date | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function parseTimeToMinutes(value?: string | null) {
  const match = textValue(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 60 + Number(match[2]);
}

function itemStartsAt(item: QuotePdfItem) {
  const raw = (item.raw || {}) as ItemRawImport;
  const segTime = raw.aereo_import?.segmentos?.find((seg) => textValue(seg?.hora_saida))?.hora_saida;
  if (segTime) return parseTimeToMinutes(segTime);
  const dirLeg = raw.flight_details?.directions?.flatMap((d) => d.legs || [])?.find((leg) => textValue(leg?.departure_time));
  if (dirLeg?.departure_time) return parseTimeToMinutes(dirLeg.departure_time);
  return Number.MAX_SAFE_INTEGER;
}

function sortItemsByDate(items: QuotePdfItem[]) {
  return items
    .map((item, idx) => ({ item, idx }))
    .sort((a, b) => {
      const da = parseIsoDateSafe(a.item.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = parseIsoDateSafe(b.item.start_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (da !== db) return da - db;
      const ta = itemStartsAt(a.item);
      const tb = itemStartsAt(b.item);
      if (ta !== tb) return ta - tb;
      const oa = Number(a.item.order_index ?? a.idx);
      const ob = Number(b.item.order_index ?? b.idx);
      if (oa !== ob) return oa - ob;
      return a.idx - b.idx;
    })
    .map(({ item }) => item);
}

function isHotelItem(item: QuotePdfItem) {
  const raw = (item.raw || {}) as ItemRawImport;
  if (raw.hotel_import) return true;
  if (raw.passeio_import || raw.aereo_import || raw.flight_details) return false;
  const typeText = normalizeType(item.item_type);
  if (
    typeText.includes("servic") ||
    typeText.includes("passeio") ||
    typeText.includes("transfer") ||
    typeText.includes("traslado") ||
    typeText.includes("seguro") ||
    typeText.includes("aereo") ||
    typeText.includes("passagem") ||
    typeText.includes("voo")
  ) {
    return false;
  }
  const t = normalizeType(`${item.item_type || ""} ${item.product_name || ""}`);
  return (
    t.includes("hotel") ||
    t.includes("hotei") ||
    t.includes("hosped") ||
    t.includes("resort") ||
    t.includes("pousada")
  );
}

function isPasseioItem(item: QuotePdfItem) {
  const raw = (item.raw || {}) as ItemRawImport;
  if (raw.passeio_import) return true;
  if (raw.hotel_import || raw.aereo_import || raw.flight_details) return false;
  const t = itemLookupText(item);
  return (
    t.includes("passeio") ||
    t.includes("servic") ||
    t.includes("seguro") ||
    t.includes("transfer") ||
    t.includes("traslado") ||
    t.includes("tour") ||
    t.includes("ingresso")
  );
}

function isAereoItem(item: QuotePdfItem) {
  const raw = (item.raw || {}) as ItemRawImport;
  if (raw.aereo_import || raw.flight_details) return true;
  const t = itemLookupText(item);
  return (
    t.includes("aereo") ||
    t.includes("passagem") ||
    t.includes("voo") ||
    t.includes("trecho") ||
    t.includes("companhia aerea")
  );
}

function hasStructuredImportData(items: QuotePdfItem[]) {
  return items.some((item) => {
    const raw = (item.raw || {}) as ItemRawImport & { format?: string };
    const hasImportFormat = normalizeType(raw.format).includes("roteiro");
    const hasSegments = Array.isArray(item.segments) && item.segments.length > 0;
    return Boolean(
      raw.hotel_import ||
        raw.passeio_import ||
        raw.aereo_import ||
        raw.flight_details ||
        hasImportFormat ||
        hasSegments
    );
  });
}

function hasRoteiroLikeItems(items: QuotePdfItem[]) {
  return items.some((item) => isHotelItem(item) || isPasseioItem(item) || isAereoItem(item));
}

function mapQuoteItemsToRoteiro(items: QuotePdfItem[], quoteName: string): RoteiroParaPdf {
  const sorted = sortItemsByDate(items);
  const hoteis: RoteiroHotelPdf[] = [];
  const passeios: RoteiroPasseioPdf[] = [];
  const transportes: RoteiroTransportePdf[] = [];

  sorted.forEach((item) => {
    const raw = (item.raw || {}) as ItemRawImport;

    if (raw.hotel_import) {
      hoteis.push({
        cidade: raw.hotel_import?.cidade || item.city_name || "",
        hotel: raw.hotel_import?.hotel || item.title || item.product_name || "Hotel",
        endereco: raw.hotel_import?.endereco || "",
        data_inicio: raw.hotel_import?.data_inicio || item.start_date || undefined,
        data_fim: raw.hotel_import?.data_fim || item.end_date || item.start_date || undefined,
        noites: Number(raw.hotel_import?.noites || 0) || undefined,
        apto: raw.hotel_import?.apto || "",
        regime: raw.hotel_import?.regime || "",
        tipo_tarifa: raw.hotel_import?.tipo_tarifa || "",
      });
      return;
    }

    if (raw.passeio_import) {
      passeios.push({
        cidade: raw.passeio_import?.cidade || item.city_name || "",
        passeio: raw.passeio_import?.passeio || item.title || item.product_name || item.item_type || "Serviço",
        fornecedor: raw.passeio_import?.fornecedor || "",
        data_inicio: raw.passeio_import?.data_inicio || item.start_date || undefined,
        data_fim: raw.passeio_import?.data_fim || item.end_date || item.start_date || undefined,
        ingressos: raw.passeio_import?.ingressos || "Inclui Ingressos",
        tipo: raw.passeio_import?.tipo || "",
      });
      return;
    }

    if (raw.aereo_import || raw.flight_details) {
      const aereo = raw.aereo_import;
      const segments = Array.isArray(aereo?.segmentos) ? aereo?.segmentos : [];
      const aiRoute = textValue(aereo?.trecho || raw.flight_details?.route || item.title || item.product_name);
      const routeParts = aiRoute
        .split("-")
        .map((p) => textValue(p))
        .filter(Boolean);
      const routeOrigem = routeParts[0] || "";
      const routeDestino = routeParts[routeParts.length - 1] || "";
      const cia = aereo?.cia_aerea || raw.flight_details?.airline || item.title || "";

      if (segments.length > 0) {
        segments.forEach((seg, idx) => {
          const origem = seg?.cidade_saida || (idx === 0 ? routeOrigem : aereo?.cidade_saida) || "";
          const destino = seg?.cidade_chegada || (idx === segments.length - 1 ? routeDestino : aereo?.cidade_chegada) || "";
          transportes.push({
            trecho: `${origem || routeOrigem || "Origem"} - ${destino || routeDestino || "Destino"}`,
            cia_aerea: cia,
            data_voo: seg?.data_voo || aereo?.data_voo || aereo?.data_inicio || item.start_date || undefined,
            data_fim: seg?.data_chegada || aereo?.data_fim || seg?.data_voo || item.end_date || item.start_date || undefined,
            hora_saida: seg?.hora_saida || aereo?.hora_saida || undefined,
            hora_chegada: seg?.hora_chegada || aereo?.hora_chegada || undefined,
            aeroporto_saida: seg?.aeroporto_saida || aereo?.aeroporto_saida || undefined,
            aeroporto_chegada: seg?.aeroporto_chegada || aereo?.aeroporto_chegada || undefined,
            classe_reserva: aereo?.classe_reserva || raw.flight_details?.cabin || undefined,
            tipo_voo: seg?.tipo_voo || aereo?.tipo_voo || undefined,
            duracao_voo: seg?.duracao_voo || aereo?.duracao_voo || undefined,
          });
        });
        return;
      }

      const directions = raw.flight_details?.directions || [];
      if (directions.length > 0) {
        directions.forEach((direction) => {
          const dateIso = parseDirectionDateToIso(direction.date) || item.start_date || "";
          (direction.legs || []).forEach((leg) => {
            transportes.push({
              trecho: `${leg.departure_city || routeOrigem || "Origem"} - ${leg.arrival_city || routeDestino || "Destino"}`,
              cia_aerea: cia,
              data_voo: dateIso || undefined,
              data_fim: dateIso || undefined,
              hora_saida: leg.departure_time || undefined,
              hora_chegada: leg.arrival_time || undefined,
              aeroporto_saida: leg.departure_code || undefined,
              aeroporto_chegada: leg.arrival_code || undefined,
              classe_reserva: raw.flight_details?.cabin || undefined,
              tipo_voo: leg.flight_type || undefined,
              duracao_voo: leg.duration || undefined,
            });
          });
        });
        return;
      }

      transportes.push({
        trecho: aiRoute || `${routeOrigem} - ${routeDestino}` || "Trecho aéreo",
        cia_aerea: cia,
        data_voo: aereo?.data_voo || aereo?.data_inicio || item.start_date || undefined,
        data_fim: aereo?.data_fim || item.end_date || item.start_date || undefined,
        hora_saida: aereo?.hora_saida || undefined,
        hora_chegada: aereo?.hora_chegada || undefined,
        aeroporto_saida: aereo?.aeroporto_saida || undefined,
        aeroporto_chegada: aereo?.aeroporto_chegada || undefined,
        classe_reserva: aereo?.classe_reserva || raw.flight_details?.cabin || undefined,
        tipo_voo: aereo?.tipo_voo || undefined,
        duracao_voo: aereo?.duracao_voo || undefined,
      });
      return;
    }

    if (isHotelItem(item)) {
      hoteis.push({
        cidade: item.city_name || "",
        hotel: item.title || item.product_name || "Hotel",
        endereco: "",
        data_inicio: item.start_date || undefined,
        data_fim: item.end_date || item.start_date || undefined,
        noites: undefined,
        apto: "",
        regime: "",
        tipo_tarifa: "",
      });
      return;
    }

    if (isPasseioItem(item)) {
      passeios.push({
        cidade: item.city_name || "",
        passeio: item.title || item.product_name || item.item_type || "Serviço",
        fornecedor: "",
        data_inicio: item.start_date || undefined,
        data_fim: item.end_date || item.start_date || undefined,
        ingressos: "Inclui Ingressos",
        tipo: "",
      });
      return;
    }

    if (isAereoItem(item)) {
      transportes.push({
        trecho: item.title || item.product_name || "Trecho aéreo",
        cia_aerea: "",
        data_voo: item.start_date || undefined,
        data_fim: item.end_date || item.start_date || undefined,
      });
    }
  });

  return {
    nome: quoteName || "Orçamento da viagem",
    titulo_documento: "Orçamento da sua viagem",
    subtitulo_documento: "",
    hoteis,
    passeios,
    transportes,
    dias: [],
    investimentos: [],
    pagamentos: [],
    inclui_texto: "",
    nao_inclui_texto: "",
    informacoes_importantes: "",
  };
}

function formatQuotePdfItems(items: QuoteItemRecord[]): QuotePdfItem[] {
  return items.map((item) => ({
    ...item,
    taxes_amount: Number(item.taxes_amount || 0),
    segments: item.quote_item_segment || [],
  }));
}

function extractStoragePath(value?: string | null) {
  if (!value) return null;
  const marker = "/quotes/";
  const index = value.indexOf(marker);
  if (index === -1) return null;
  return value.slice(index + marker.length);
}

async function resolveStorageUrl(url?: string | null, path?: string | null) {
  let resolvedUrl = url || null;
  const storagePath = path || extractStoragePath(url);
  if (storagePath) {
    const signed = await supabaseBrowser.storage
      .from("quotes")
      .createSignedUrl(storagePath, 3600);
    if (signed.data?.signedUrl) {
      resolvedUrl = signed.data.signedUrl;
    }
  }
  return resolvedUrl;
}

async function fetchQuoteItems(quoteId: string) {
  const { data, error } = await supabaseBrowser
    .from("quote_item")
    .select(
    "id, item_type, title, product_name, city_name, cidade_id, cidade:cidades(id, nome), quantity, unit_price, total_amount, taxes_amount, start_date, end_date, currency, confidence, order_index, raw, quote_item_segment (id, segment_type, data, order_index)"
    )
    .eq("quote_id", quoteId)
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as QuoteItemRecord[];
}

export async function exportQuotePdfById(args: ExportArgs): Promise<string | void> {
  const { quoteId, showItemValues = true, showSummary, discount, action = "download" } = args;
  const { data: auth } = await supabaseBrowser.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) {
    throw new Error("Usuario nao autenticado.");
  }

  const { data: quote, error: quoteError } = await supabaseBrowser
    .from("quote")
    .select("id, created_at, currency, total, status, client_name, cliente:client_id (nome)")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError || !quote) {
    throw new Error("Orcamento nao encontrado.");
  }

  const items = await fetchQuoteItems(quote.id);

  const { data: settings, error: settingsErr } = await supabaseBrowser
    .from("quote_print_settings")
    .select(
      "logo_url, logo_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto, imagem_complementar_url, imagem_complementar_path"
    )
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (settingsErr) throw settingsErr;
  if (!settings) {
    throw new Error("Configure os parametros do PDF em Parametros > Orcamentos.");
  }

  const logoUrl = await resolveStorageUrl(settings.logo_url, settings.logo_path);
  const complementImageUrl = await resolveStorageUrl(
    settings.imagem_complementar_url,
    settings.imagem_complementar_path
  );

  const formattedItems = formatQuotePdfItems(items);

  if (hasStructuredImportData(formattedItems) || hasRoteiroLikeItems(formattedItems)) {
    const valorSemTaxas = formattedItems.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const taxas = formattedItems.reduce((sum, item) => sum + Number(item.taxes_amount || 0), 0);
    const safeDiscount = Number.isFinite(Number(discount || 0)) ? Math.max(Number(discount || 0), 0) : 0;
    const roteiro = mapQuoteItemsToRoteiro(
      formattedItems,
      quote.client_name || quote.cliente?.nome || "Orçamento da viagem"
    );
    roteiro.subtitulo_documento = formatDateLong(quote.created_at || null) || roteiro.nome;
    roteiro.orcamento_resumo = {
      itens: formattedItems.length,
      valor_sem_taxas: valorSemTaxas,
      taxas,
      desconto: safeDiscount,
      total: Math.max(valorSemTaxas + taxas - safeDiscount, 0),
    };
    return await exportRoteiroPdf(roteiro, { action });
  }

  return await exportQuoteToPdf({
    quote: {
      id: quote.id,
      created_at: quote.created_at || null,
      total: quote.total || 0,
      currency: quote.currency || "BRL",
      client_name: quote.client_name || quote.cliente?.nome || null,
    },
    items: formattedItems,
    settings: {
      ...settings,
      logo_url: logoUrl,
      imagem_complementar_url: complementImageUrl,
    },
    options: {
      showItemValues,
      showSummary: showSummary ?? showItemValues,
      discount,
      action,
    },
  });
}

export async function loadQuotePreviewHtmlById(args: PreviewArgs): Promise<string> {
  const { quoteId, showItemValues = true, showSummary = true, discount } = args;
  const { data: auth } = await supabaseBrowser.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) {
    throw new Error("Usuario nao autenticado.");
  }

  const { data: quote, error: quoteError } = await supabaseBrowser
    .from("quote")
    .select("id, created_at, currency, total, status, client_name, cliente:client_id (nome)")
    .eq("id", quoteId)
    .maybeSingle();
  if (quoteError || !quote) {
    throw new Error("Orcamento nao encontrado.");
  }

  const items = await fetchQuoteItems(quote.id);
  const formattedItems = formatQuotePdfItems(items);

  const { data: settings } = await supabaseBrowser
    .from("quote_print_settings")
    .select(
      "logo_url, logo_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto, imagem_complementar_url, imagem_complementar_path"
    )
    .eq("owner_user_id", userId)
    .maybeSingle();

  const logoUrl = settings ? await resolveStorageUrl(settings.logo_url, settings.logo_path).catch(() => null) : null;
  const complementImageUrl = settings
    ? await resolveStorageUrl(settings.imagem_complementar_url, settings.imagem_complementar_path).catch(() => null)
    : null;

  return await buildQuotePreviewHtml({
    quote: {
      id: quote.id,
      created_at: quote.created_at || null,
      total: quote.total || 0,
      currency: quote.currency || "BRL",
      client_name: quote.client_name || quote.cliente?.nome || null,
    },
    items: formattedItems,
    settings: {
      ...(settings || {}),
      logo_url: logoUrl,
      imagem_complementar_url: complementImageUrl,
    },
    options: {
      showItemValues,
      showSummary,
      discount,
    },
  });
}
