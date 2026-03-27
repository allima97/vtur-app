import { jsPDF } from "jspdf";
import { resolveAirlineIata, resolveAirlineNameByIata } from "../airlineIata";
import { extractSeguroViagemIncludeLinesFromPasseios, isSeguroPasseioLike } from "../roteiroSeguro";
import { supabaseBrowser } from "../supabase-browser";
import { construirLinkWhatsApp } from "../whatsapp";
import { QuotePdfSettings } from "./quotePdf";

export type RoteiroParaPdf = {
  nome: string;
  titulo_documento?: string | null;
  subtitulo_documento?: string | null;
  orcamento_resumo?: RoteiroOrcamentoResumoPdf | null;
  duracao?: number | null;
  inicio_cidade?: string | null;
  fim_cidade?: string | null;
  inclui_texto?: string | null;
  nao_inclui_texto?: string | null;
  informacoes_importantes?: string | null;
  hoteis?: RoteiroHotelPdf[];
  passeios?: RoteiroPasseioPdf[];
  transportes?: RoteiroTransportePdf[];
  dias?: RoteiroDiaPdf[];
  investimentos?: RoteiroInvestimentoPdf[];
  pagamentos?: RoteiroPagamentoPdf[];
};

export type RoteiroHotelPdf = {
  cidade?: string;
  hotel?: string;
  endereco?: string;
  data_inicio?: string;
  data_fim?: string;
  noites?: number;
  qtd_apto?: number;
  apto?: string;
  categoria?: string;
  regime?: string;
  tipo_tarifa?: string;
  qtd_adultos?: number;
  qtd_criancas?: number;
  valor_original?: number;
  valor_final?: number;
};

export type RoteiroPasseioPdf = {
  cidade?: string;
  passeio?: string;
  fornecedor?: string;
  data_inicio?: string;
  data_fim?: string;
  tipo?: string;
  ingressos?: string;
  qtd_adultos?: number;
  qtd_criancas?: number;
  valor_original?: number;
  valor_final?: number;
};

export type RoteiroTransportePdf = {
  trecho?: string;
  cia_aerea?: string;
  data_voo?: string;
  classe_reserva?: string;
  hora_saida?: string;
  aeroporto_saida?: string;
  duracao_voo?: string;
  tipo_voo?: string;
  hora_chegada?: string;
  aeroporto_chegada?: string;
  tarifa_nome?: string;
  reembolso_tipo?: string;
  qtd_adultos?: number;
  qtd_criancas?: number;
  taxas?: number;
  valor_total?: number;
  tipo?: string;
  fornecedor?: string;
  descricao?: string;
  data_inicio?: string;
  data_fim?: string;
  categoria?: string;
  observacao?: string;
};

export type RoteiroDiaPdf = {
  percurso?: string;
  cidade?: string;
  data?: string;
  descricao?: string;
  ordem?: number;
};

export type RoteiroInvestimentoPdf = {
  tipo?: string;
  valor_por_pessoa?: number;
  qtd_apto?: number;
  valor_por_apto?: number;
};

export type RoteiroPagamentoPdf = {
  servico?: string;
  valor_total_com_taxas?: number;
  taxas?: number;
  forma_pagamento?: string;
};

export type RoteiroOrcamentoResumoPdf = {
  itens?: number;
  valor_sem_taxas?: number;
  taxas?: number;
  desconto?: number;
  total?: number;
};

export type ExportRoteiroPdfOptions = {
  action?: "download" | "preview" | "blob-url";
};

function parseParagraphItems(text: string) {
  const normalized = String(text || "").replace(/\r/g, "\n");
  return normalized
    // parágrafos = separados por linha em branco
    .split(/\n\s*\n+/)
    // junta quebras simples dentro do parágrafo
    .map((p) => p.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function parseLineItems(text: string) {
  const normalized = String(text || "").replace(/\r/g, "\n");
  return normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

type PagamentoGroupPdf = {
  order: number;
  servicos: string[];
  formas: string[];
  subtotal: number;
  taxesTotal: number;
  total: number;
};

function groupPagamentosByFormaForPdf(items: RoteiroPagamentoPdf[]): PagamentoGroupPdf[] {
  const groups = new Map<
    string,
    {
      order: number;
      servicos: Set<string>;
      formas: string[];
      formasSeen: Set<string>;
      subtotal: number;
      taxesTotal: number;
      total: number;
    }
  >();

  items.forEach((item, index) => {
    const formas = parseLineItems(String(item.forma_pagamento || ""))
      .map((value) => formatBudgetItemText(value))
      .filter(Boolean);
    const normalizedFormas = Array.from(new Set(formas.map((value) => normalizeLookup(value)).filter(Boolean))).sort();
    const groupKey = normalizedFormas.length > 0 ? normalizedFormas.join("|") : "__sem_forma__";
    const servico = formatBudgetItemText(item.servico);

    let group = groups.get(groupKey);
    if (!group) {
      group = {
        order: index,
        servicos: new Set<string>(),
        formas: [],
        formasSeen: new Set<string>(),
        subtotal: 0,
        taxesTotal: 0,
        total: 0,
      };
      groups.set(groupKey, group);
    }

    if (servico) group.servicos.add(servico);
    formas.forEach((forma) => {
      const lookup = normalizeLookup(forma);
      if (!lookup || group!.formasSeen.has(lookup)) return;
      group!.formasSeen.add(lookup);
      group!.formas.push(forma);
    });

    const itemTotal = Number(item.valor_total_com_taxas || 0);
    const itemTax = Number(item.taxas || 0);
    const safeTotal = Number.isFinite(itemTotal) ? Math.max(itemTotal, 0) : 0;
    const safeTax = Number.isFinite(itemTax) ? Math.max(itemTax, 0) : 0;
    group.total += safeTotal;
    group.taxesTotal += safeTax;
    group.subtotal += Math.max(safeTotal - safeTax, 0);

  });

  return Array.from(groups.values())
    .sort((a, b) => a.order - b.order)
    .map((group) => ({
      order: group.order,
      servicos: Array.from(group.servicos),
      formas: group.formas,
      subtotal: group.subtotal,
      taxesTotal: group.taxesTotal,
      total: group.total,
    }));
}

function formatCurrency(value?: number | null) {
  if (!value || !Number.isFinite(value)) return "R$ 0,00";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function calcAereoValor(valueTotal?: number | string | null, taxas?: number | string | null) {
  const total = Number(valueTotal);
  const taxes = Number(taxas);
  const safeTotal = Number.isFinite(total) ? total : 0;
  const safeTaxes = Number.isFinite(taxes) ? taxes : 0;
  return Math.max(Number((safeTotal - safeTaxes).toFixed(2)), 0);
}

function splitTrechoCities(trecho?: string | null) {
  const parts = String(trecho || "")
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
  return {
    origem: parts[0] || "",
    destino: parts[1] || "",
  };
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

function formatFlightPlace(city?: string | null, airport?: string | null) {
  const cityValue = formatBudgetItemText(city);
  const airportValue = textValue(airport).toUpperCase();
  if (!cityValue && !airportValue) return "";
  if (!/^[A-Z]{3}$/.test(airportValue)) return cityValue || airportValue;
  if (!cityValue) return airportValue;
  if (new RegExp(`\\(${airportValue}\\)\\s*$`, "i").test(cityValue)) return cityValue;
  const normalizedCity = cityValue
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  if (normalizedCity === airportValue) return airportValue;
  return `${cityValue} (${airportValue})`;
}

function formatAirlineName(value?: string | null) {
  const raw = textValue(value);
  if (!raw) return "";
  const cleaned = raw
    .replace(/\([^)]+\)/g, " ")
    .replace(/\b(ida|volta|trecho)\s*\d*\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return formatBudgetItemText(cleaned);
}

function truncatePdfText(doc: jsPDF, value: string, maxWidth: number) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (doc.getTextWidth(text) <= maxWidth) return text;
  const ellipsis = "...";
  let out = text;
  while (out.length > 0 && doc.getTextWidth(out + ellipsis) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out ? `${out}${ellipsis}` : "";
}

function groupPasseiosByCidadeForPdf(items: RoteiroPasseioPdf[]) {
  const groups = new Map<string, { cidade: string; items: RoteiroPasseioPdf[] }>();
  items.forEach((item) => {
    const cidade = formatBudgetItemText(item.cidade) || "Serviços";
    const key = cidade.toLocaleLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { cidade, items: [] });
    }
    groups.get(key)!.items.push(item);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items
        .slice()
        .sort((a, b) => {
          const aSeguro = isSeguroPasseioLike(a as any);
          const bSeguro = isSeguroPasseioLike(b as any);
          if (aSeguro !== bSeguro) return aSeguro ? -1 : 1;
          const dateCompare = String(a.data_inicio || "").localeCompare(String(b.data_inicio || ""));
          if (dateCompare !== 0) return dateCompare;
          return formatBudgetItemText(a.passeio).localeCompare(formatBudgetItemText(b.passeio));
        }),
    }))
    .sort((a, b) => {
      const aHasSeguro = a.items.some((item) => isSeguroPasseioLike(item as any));
      const bHasSeguro = b.items.some((item) => isSeguroPasseioLike(item as any));
      if (aHasSeguro !== bHasSeguro) return aHasSeguro ? -1 : 1;
      const aStart = String(a.items[0]?.data_inicio || "");
      const bStart = String(b.items[0]?.data_inicio || "");
      return aStart.localeCompare(bStart);
    });
}

function groupHoteisByCidadeForPdf(items: RoteiroHotelPdf[]) {
  const groups = new Map<string, { cidade: string; items: RoteiroHotelPdf[] }>();
  items.forEach((item) => {
    const cidade = formatBudgetItemText(item.cidade) || "Hospedagem";
    const key = cidade.toLocaleLowerCase();
    if (!groups.has(key)) {
      groups.set(key, { cidade, items: [] });
    }
    groups.get(key)!.items.push(item);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: group.items
        .slice()
        .sort((a, b) => {
          const dateCompare = String(a.data_inicio || "").localeCompare(String(b.data_inicio || ""));
          if (dateCompare !== 0) return dateCompare;
          return formatBudgetItemText(a.hotel).localeCompare(formatBudgetItemText(b.hotel));
        }),
    }))
    .sort((a, b) => {
      const aStart = String(a.items[0]?.data_inicio || "");
      const bStart = String(b.items[0]?.data_inicio || "");
      return aStart.localeCompare(bStart);
    });
}

function formatDate(value?: string | null) {
  if (!value) return "";
  try {
    const date = new Date(value + "T12:00:00");
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("pt-BR");
  } catch {
    return value;
  }
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

function normalizeDiaKey(d: { cidade?: string | null; percurso?: string | null; data?: string | null; descricao?: string | null }): string {
  const cidade = String(d.cidade || "").trim().toLocaleLowerCase();
  const percurso = String(d.percurso || "").trim().toLocaleLowerCase();
  const data = String(d.data || "").trim();
  const descricao = String(d.descricao || "").trim().toLocaleLowerCase();
  return `${data}__${cidade}__${percurso}__${descricao}`;
}

function normalizeDiasForPdf(dias: Array<{ cidade?: string | null; percurso?: string | null; data?: string | null; descricao?: string | null; ordem?: number | null }>) {
  const sorted = (dias || [])
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    .map((d) => ({
      ...d,
      percurso: String((d as any).percurso || "").trim(),
      cidade: String(d.cidade || "").trim(),
      data: String(d.data || "").trim(),
      descricao: String(d.descricao || "").trim(),
    }))
    .filter((d) => Boolean((d as any).percurso || d.cidade || d.data || d.descricao));

  const seen = new Set<string>();
  const unique: typeof sorted = [];
  for (const d of sorted) {
    const key = normalizeDiaKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
  }

  return unique;
}

function textValue(value?: string | null) {
  return String(value || "").trim();
}

function normalizeLookup(value?: string | null) {
  return textValue(value).toLocaleLowerCase();
}

function normalizeCompare(value?: string | null) {
  return textValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function hasPositiveNumber(value?: number | string | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

function hasMeaningfulHotel(h: RoteiroHotelPdf) {
  return Boolean(
    textValue(h.cidade) ||
      textValue(h.hotel) ||
      textValue(h.endereco) ||
      textValue(h.data_inicio) ||
      textValue(h.data_fim) ||
      hasPositiveNumber(h.qtd_apto) ||
      textValue(h.apto) ||
      textValue(h.categoria) ||
      textValue(h.tipo_tarifa) ||
      hasPositiveNumber(h.qtd_adultos) ||
      hasPositiveNumber(h.qtd_criancas) ||
      hasPositiveNumber(h.valor_original) ||
      hasPositiveNumber(h.valor_final) ||
      textValue(h.regime) ||
      hasPositiveNumber(h.noites)
  );
}

function hasMeaningfulPasseio(p: RoteiroPasseioPdf) {
  const tipoNorm = normalizeLookup(p.tipo);
  const ingressosNorm = normalizeLookup(p.ingressos);
  const tipoDefault = tipoNorm === "compartilhado";
  const ingressosDefault = ingressosNorm === "inclui ingressos";
  return Boolean(
    textValue(p.cidade) ||
      textValue(p.passeio) ||
      textValue(p.fornecedor) ||
      textValue(p.data_inicio) ||
      textValue(p.data_fim) ||
      hasPositiveNumber(p.qtd_adultos) ||
      hasPositiveNumber(p.qtd_criancas) ||
      hasPositiveNumber(p.valor_original) ||
      hasPositiveNumber(p.valor_final) ||
      (textValue(p.tipo) && !tipoDefault) ||
      (textValue(p.ingressos) && !ingressosDefault)
  );
}

function hasMeaningfulTransporte(t: RoteiroTransportePdf) {
  return Boolean(
    textValue(t.trecho) ||
      textValue(t.cia_aerea) ||
      textValue(t.data_voo) ||
      textValue(t.classe_reserva) ||
      textValue(t.hora_saida) ||
      textValue(t.aeroporto_saida) ||
      textValue(t.duracao_voo) ||
      textValue(t.tipo_voo) ||
      textValue(t.hora_chegada) ||
      textValue(t.aeroporto_chegada) ||
      textValue(t.tarifa_nome) ||
      textValue(t.reembolso_tipo) ||
      hasPositiveNumber(t.qtd_adultos) ||
      hasPositiveNumber(t.qtd_criancas) ||
      hasPositiveNumber(t.taxas) ||
      hasPositiveNumber(t.valor_total) ||
      textValue(t.tipo) ||
      textValue(t.fornecedor) ||
      textValue(t.descricao) ||
      textValue(t.data_inicio) ||
      textValue(t.data_fim) ||
      textValue(t.categoria) ||
      textValue(t.observacao)
  );
}

function hasMeaningfulInvestimento(i: RoteiroInvestimentoPdf) {
  const qtd = Number(i.qtd_apto || 0);
  return Boolean(
    textValue(i.tipo) ||
      hasPositiveNumber(i.valor_por_pessoa) ||
      hasPositiveNumber(i.valor_por_apto) ||
      (Number.isFinite(qtd) && qtd > 1)
  );
}

function hasMeaningfulPagamento(p: RoteiroPagamentoPdf) {
  return Boolean(
    textValue(p.servico) ||
      textValue(p.forma_pagamento) ||
      hasPositiveNumber(p.valor_total_com_taxas) ||
      hasPositiveNumber(p.taxas)
  );
}

async function fetchImageData(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar imagem.");
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Falha ao ler imagem."));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, format: blob.type?.includes("png") ? "PNG" : "JPEG" };
}

async function resolveStorageUrl(url?: string | null, path?: string | null) {
  const storagePath = path || (() => {
    if (!url) return null;
    const marker = "/quotes/";
    const index = url.indexOf(marker);
    return index === -1 ? null : url.slice(index + marker.length);
  })();
  if (storagePath) {
    const signed = await supabaseBrowser.storage
      .from("quotes")
      .createSignedUrl(storagePath, 3600);
    if (signed.data?.signedUrl) return signed.data.signedUrl;
  }
  return url || null;
}

export async function exportRoteiroPdf(
  roteiro: RoteiroParaPdf,
  options: ExportRoteiroPdfOptions = {}
): Promise<string | void> {
  const action = options.action || "download";
  const { data: auth } = await supabaseBrowser.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("Usuario nao autenticado.");

  const { data: settings, error: settingsErr } = await supabaseBrowser
    .from("quote_print_settings")
    .select(
      "logo_url, logo_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto, imagem_complementar_url, imagem_complementar_path"
    )
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (settingsErr) throw settingsErr;
  if (!settings) throw new Error("Configure os parametros do PDF em Parametros > Orcamentos.");

  const pdfSettings = settings as QuotePdfSettings;

  const logoUrl = await resolveStorageUrl(settings.logo_url, settings.logo_path).catch(() => null);
  const airlineLookup = await (async () => {
    try {
      const [{ data: codes }, { data: aliases }] = await Promise.all([
        supabaseBrowser
          .from("airline_iata_codes")
          .select("id, iata_code, airline_name")
          .eq("active", true)
          .limit(2000),
        supabaseBrowser
          .from("airline_iata_aliases")
          .select("airline_code_id, alias")
          .limit(5000),
      ]);

      const aliasByCodeId = new Map<string, string[]>();
      (aliases || []).forEach((row: any) => {
        const codeId = String(row?.airline_code_id || "").trim();
        const alias = String(row?.alias || "").trim();
        if (!codeId || !alias) return;
        const current = aliasByCodeId.get(codeId) || [];
        current.push(alias);
        aliasByCodeId.set(codeId, current);
      });

      return (codes || []).map((row: any) => {
        const codeId = String(row?.id || "").trim();
        return {
          iata: String(row?.iata_code || "").trim().toUpperCase(),
          name: String(row?.airline_name || "").trim(),
          aliases: aliasByCodeId.get(codeId) || [],
        };
      });
    } catch {
      return [];
    }
  })();

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const headerLogoSize = 70;
  const headerRightWidth = 220;
  const headerRightLineHeight = 14;
  const headerRightPaddingTop = 12;
  const qrSize = 60;
  const qrGap = 8;
  const qrLabelText = "Aponte para o QR Code abaixo e chame o consultor:";
  const qrLabelFontSize = 8;
  const qrLabelLineHeight = 10;
  const qrLabelGap = 6;
  const pageNumberY = pageHeight - margin / 2;
  const contentBottom = pageHeight - margin;
  const bodyFont = "times" as const;
  const bodyFontSize = 11;
  const bodyLineHeight = 14;
  const cardRadius = 10;
  const cardBorder = [209, 213, 219] as [number, number, number];
  const cardPaddingX = 16;
  const cardPaddingTop = 12;
  const cardPaddingBottom = 12;
  const cardGapAfter = 14;
  const minRoomForNewCard = 130; // força título + algumas linhas na mesma página

  // Load logo
  let logoData: { dataUrl: string; format: string } | null = null;
  if (logoUrl) {
    try { logoData = await fetchImageData(logoUrl); } catch { logoData = null; }
  }

  const colors = {
    border: [156, 163, 175] as [number, number, number],
    divider: [210, 214, 227] as [number, number, number],
    muted: [100, 116, 139] as [number, number, number],
    text: [15, 23, 42] as [number, number, number],
    title: [26, 44, 200] as [number, number, number],
  };

  let curY = margin;

  const pagamentos = (roteiro.pagamentos || []).filter((p) => hasMeaningfulPagamento(p));
  const resumoOrcamento = roteiro.orcamento_resumo || null;

  const whatsappLink = construirLinkWhatsApp(pdfSettings.whatsapp, (pdfSettings as any).whatsapp_codigo_pais);

  let qrData: { dataUrl: string; format: string } | null = null;
  if (whatsappLink) {
    try {
      const qrUrl = `https://quickchart.io/qr?size=200&margin=1&text=${encodeURIComponent(whatsappLink)}`;
      qrData = await fetchImageData(qrUrl);
    } catch {
      qrData = null;
    }
  }

  const rightLines = [
    pdfSettings.consultor_nome ? `Consultor: ${pdfSettings.consultor_nome}` : null,
    pdfSettings.telefone ? `Telefone: ${pdfSettings.telefone}` : null,
    pdfSettings.whatsapp ? `WhatsApp: ${pdfSettings.whatsapp}` : null,
    pdfSettings.email ? `E-mail: ${pdfSettings.email}` : null,
  ].filter(Boolean) as string[];

  const headerLayout = (() => {
    const qrEnabled = Boolean(whatsappLink);
    const rightTextWidth = qrEnabled ? headerRightWidth - qrSize - qrGap : headerRightWidth;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const rightWrapped = rightLines.map((line) => doc.splitTextToSize(line, rightTextWidth));
    const rightLineCount = rightWrapped.reduce((sum, lines) => sum + lines.length, 0);
    const rightTextHeight = rightLineCount * headerRightLineHeight;
    const rightTextBlockHeight = headerRightPaddingTop + rightTextHeight;

    let qrLabelLines: string[] = [];
    let qrLabelHeight = 0;
    if (qrEnabled) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(qrLabelFontSize);
      qrLabelLines = doc.splitTextToSize(qrLabelText, headerRightWidth);
      qrLabelHeight = qrLabelLines.length * qrLabelLineHeight;
    }

    const rightBlockHeight = qrEnabled
      ? qrLabelHeight + qrLabelGap + Math.max(rightTextBlockHeight, qrSize)
      : rightTextBlockHeight;
    const headerContentHeight = Math.max(headerLogoSize, rightBlockHeight);
    const summaryBoxHeight = 70;
    const headerHeightFirst = Math.max(200, headerContentHeight + summaryBoxHeight + 38);
    const headerHeightOther = headerContentHeight + 32;

    return {
      qrEnabled,
      rightTextWidth,
      rightWrapped,
      qrLabelLines,
      qrLabelHeight,
      headerContentHeight,
      headerHeightFirst,
      headerHeightOther,
    };
  })();

  let activeCardTitle: string | null = null;
  let activeCardStartY: number | null = null;
  let activeCardIndent = 0;
  let activeCardShowTitle = true;
  type PdfIconKind =
    | "itinerary"
    | "hotel"
    | "passeio"
    | "flight"
    | "invest"
    | "included"
    | "excluded"
    | "payment"
    | "info"
    | "city";

  function getSectionIconKind(title: string): PdfIconKind | null {
    const normalized = String(title || "").toLocaleLowerCase();
    if (normalized.includes("itinerário detalhado")) return "itinerary";
    if (normalized.includes("hotéis sugeridos")) return "hotel";
    if (normalized.includes("passeios e serviços")) return "passeio";
    if (normalized.includes("passagem aérea")) return "flight";
    if (normalized.includes("investimento")) return "invest";
    if (normalized.includes("o que está incluído")) return "included";
    if (normalized.includes("o que não está incluído")) return "excluded";
    if (normalized.includes("pagamento")) return "payment";
    if (normalized.includes("informações importantes")) return "info";
    return null;
  }

  function drawIcon(kind: PdfIconKind, x: number, y: number, color: [number, number, number], size = 14) {
    const s = Math.max(size, 10);
    doc.setDrawColor(...color);
    doc.setTextColor(...color);
    doc.setLineWidth(1);

    if (kind === "itinerary") {
      const r = s * 0.12;
      const yMid = y + s * 0.5;
      const x1 = x + s * 0.12;
      const x2 = x + s * 0.5;
      const x3 = x + s * 0.88;
      doc.circle(x1, yMid, r, "S");
      doc.circle(x2, y + s * 0.24, r, "S");
      doc.circle(x3, y + s * 0.72, r, "S");
      doc.line(x1 + r, yMid, x2 - r, y + s * 0.24);
      doc.line(x2 + r, y + s * 0.24, x3 - r, y + s * 0.72);
      return;
    }

    if (kind === "hotel") {
      const baseY = y + s * 0.74;
      doc.rect(x + s * 0.14, baseY - s * 0.2, s * 0.72, s * 0.2, "S");
      doc.rect(x + s * 0.14, baseY - s * 0.38, s * 0.22, s * 0.18, "S");
      doc.line(x + s * 0.14, baseY, x + s * 0.14, baseY + s * 0.12);
      doc.line(x + s * 0.86, baseY, x + s * 0.86, baseY + s * 0.12);
      return;
    }

    if (kind === "passeio") {
      doc.circle(x + s * 0.5, y + s * 0.5, s * 0.28, "S");
      doc.line(x + s * 0.5, y + s * 0.22, x + s * 0.5, y + s * 0.78);
      doc.line(x + s * 0.22, y + s * 0.5, x + s * 0.78, y + s * 0.5);
      return;
    }

    if (kind === "flight") {
      doc.line(x + s * 0.08, y + s * 0.52, x + s * 0.9, y + s * 0.52);
      doc.line(x + s * 0.58, y + s * 0.3, x + s * 0.9, y + s * 0.52);
      doc.line(x + s * 0.58, y + s * 0.74, x + s * 0.9, y + s * 0.52);
      doc.line(x + s * 0.32, y + s * 0.4, x + s * 0.2, y + s * 0.2);
      doc.line(x + s * 0.32, y + s * 0.64, x + s * 0.2, y + s * 0.84);
      return;
    }

    if (kind === "invest") {
      const billX = x + s * 0.1;
      const billY = y + s * 0.2;
      const billW = s * 0.8;
      const billH = s * 0.56;
      doc.roundedRect(billX, billY, billW, billH, 1.6, 1.6, "S");
      doc.circle(billX + billW * 0.5, billY + billH * 0.5, s * 0.12, "S");
      doc.line(billX + billW * 0.16, billY + billH * 0.24, billX + billW * 0.28, billY + billH * 0.24);
      doc.line(billX + billW * 0.72, billY + billH * 0.76, billX + billW * 0.84, billY + billH * 0.76);
      return;
    }

    if (kind === "included") {
      doc.roundedRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, 2, 2);
      doc.line(x + s * 0.28, y + s * 0.52, x + s * 0.45, y + s * 0.7);
      doc.line(x + s * 0.45, y + s * 0.7, x + s * 0.74, y + s * 0.34);
      return;
    }

    if (kind === "excluded") {
      doc.roundedRect(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, 2, 2);
      doc.line(x + s * 0.28, y + s * 0.28, x + s * 0.72, y + s * 0.72);
      doc.line(x + s * 0.72, y + s * 0.28, x + s * 0.28, y + s * 0.72);
      return;
    }

    if (kind === "payment") {
      doc.roundedRect(x + s * 0.08, y + s * 0.2, s * 0.84, s * 0.62, 2, 2);
      doc.line(x + s * 0.08, y + s * 0.38, x + s * 0.92, y + s * 0.38);
      doc.line(x + s * 0.2, y + s * 0.58, x + s * 0.42, y + s * 0.58);
      return;
    }

    if (kind === "info") {
      doc.circle(x + s * 0.5, y + s * 0.5, s * 0.34, "S");
      doc.line(x + s * 0.5, y + s * 0.42, x + s * 0.5, y + s * 0.66);
      doc.circle(x + s * 0.5, y + s * 0.28, s * 0.03, "F");
      return;
    }

    if (kind === "city") {
      const cx = x + s * 0.5;
      const cy = y + s * 0.38;
      const r = s * 0.2;
      doc.circle(cx, cy, r, "S");
      doc.circle(cx, cy, r * 0.35, "S");
      doc.line(cx - r * 0.75, cy + r * 0.7, cx, y + s * 0.92);
      doc.line(cx + r * 0.75, cy + r * 0.7, cx, y + s * 0.92);
    }
  }

  function closeCard({ addGapAfter }: { addGapAfter: boolean }) {
    if (!activeCardTitle || activeCardStartY == null) return;
    const cardX = margin;
    const cardW = pageWidth - margin * 2;
    const endY = curY + cardPaddingBottom;
    const h = Math.max(28, endY - activeCardStartY);
    doc.setDrawColor(...cardBorder);
    doc.setLineWidth(0.8);
    doc.roundedRect(cardX, activeCardStartY, cardW, h, cardRadius, cardRadius);
    curY = activeCardStartY + h;
    activeCardTitle = null;
    activeCardStartY = null;
    activeCardIndent = 0;
    activeCardShowTitle = true;
    if (addGapAfter) curY += cardGapAfter;
  }

  function openCard(title: string, indent = cardPaddingX, opts: { showTitle?: boolean } = {}) {
    const showTitle = opts.showTitle !== false;
    // Prefer quebrar página antes de abrir um novo título, para evitar título "solto" no rodapé.
    if (curY + minRoomForNewCard > contentBottom) {
      doc.addPage();
      curY = margin;
      drawPageHeader();
    }

    activeCardTitle = title;
    activeCardStartY = curY;
    activeCardIndent = indent;
    activeCardShowTitle = showTitle;

    curY += cardPaddingTop;
    if (showTitle) {
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(title, margin + indent, curY + 12);
      curY += 24;
    } else {
      // continuação do card em nova página: sem repetir o título
      curY += 10;
    }
  }

  function ensureRoomForStandaloneCard(needed: number) {
    if (activeCardTitle) return;
    if (curY + needed > contentBottom) {
      doc.addPage();
      curY = margin;
      drawPageHeader();
    }
  }

  function ensureSpace(needed: number) {
    if (activeCardTitle && activeCardStartY != null) {
      if (curY + needed + cardPaddingBottom > contentBottom) {
        const title = activeCardTitle;
        const indent = activeCardIndent;
        const showTitle = activeCardShowTitle;
        closeCard({ addGapAfter: false });
        doc.addPage();
        curY = margin;
        drawPageHeader();
        // Não repetir o título ao continuar na página seguinte.
        openCard(title, indent, { showTitle: false });
        // manter flag original (título já foi mostrado na primeira página)
        activeCardShowTitle = showTitle;
      }
      return;
    }
    if (curY + needed > contentBottom) {
      doc.addPage();
      curY = margin;
      drawPageHeader();
    }
  }

  function drawPageHeader() {
    const topY = margin;
    const isFirstPage = doc.getNumberOfPages() === 1;
    const logoSize = headerLogoSize;
    const leftX = margin;
    let textX = leftX;

    doc.setTextColor(...colors.text);

    if (logoData) {
      doc.addImage(logoData.dataUrl, logoData.format, leftX, topY, logoSize, logoSize);
      textX = leftX + logoSize + 12;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    const leftLines = [
      pdfSettings.filial_nome ? `Filial: ${pdfSettings.filial_nome}` : null,
      pdfSettings.endereco_linha1 || null,
      pdfSettings.endereco_linha2 || null,
      pdfSettings.endereco_linha3 || null,
    ].filter(Boolean) as string[];

    leftLines.forEach((line, idx) => {
      doc.text(line, textX, topY + 12 + idx * 14);
    });

    const rightX = pageWidth - margin - headerRightWidth;
    const rightContentTop =
      topY + (headerLayout.qrEnabled ? headerLayout.qrLabelHeight + qrLabelGap : 0);
    const rightTextStartY = rightContentTop + headerRightPaddingTop;

    if (headerLayout.qrEnabled && headerLayout.qrLabelLines.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(qrLabelFontSize);
      const labelStartY = topY + qrLabelLineHeight;
      headerLayout.qrLabelLines.forEach((line, idx) => {
        doc.text(line, rightX, labelStartY + idx * qrLabelLineHeight);
      });
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    let rightCursorY = rightTextStartY;
    headerLayout.rightWrapped.forEach((wrapped) => {
      wrapped.forEach((line) => {
        doc.text(line, rightX, rightCursorY);
        rightCursorY += headerRightLineHeight;
      });
    });

    if (headerLayout.qrEnabled && qrData) {
      const qrX = pageWidth - margin - qrSize;
      const qrY = rightContentTop;
      doc.addImage(qrData.dataUrl, qrData.format, qrX, qrY, qrSize, qrSize);
    }

    const lineY = topY + headerLayout.headerContentHeight + 16;
    doc.setDrawColor(180);
    doc.line(margin, lineY, pageWidth - margin, lineY);

    if (isFirstPage && resumoOrcamento) {
      const itemsCount = Math.max(Number(resumoOrcamento.itens || 0), 0);
      const valorSemTaxas = Number.isFinite(Number(resumoOrcamento.valor_sem_taxas || 0))
        ? Math.max(Number(resumoOrcamento.valor_sem_taxas || 0), 0)
        : 0;
      const taxesTotal = Number.isFinite(Number(resumoOrcamento.taxas || 0))
        ? Math.max(Number(resumoOrcamento.taxas || 0), 0)
        : 0;
      const discountValue = Number.isFinite(Number(resumoOrcamento.desconto || 0))
        ? Math.max(Number(resumoOrcamento.desconto || 0), 0)
        : 0;
      const totalValue = Number.isFinite(Number(resumoOrcamento.total || 0))
        ? Math.max(Number(resumoOrcamento.total || 0), 0)
        : Math.max(valorSemTaxas + taxesTotal - discountValue, 0);
      const hasDiscount = discountValue > 0;
      const titleText = String(roteiro.titulo_documento || "Orçamento da sua viagem").trim();
      const dateText = String(roteiro.subtitulo_documento || "").trim();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...colors.title);
      doc.text(titleText, margin, lineY + 26);

      if (dateText) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(...colors.text);
        doc.text(dateText, margin, lineY + 44);
      }

      const boxW = 190;
      const boxH = hasDiscount ? 90 : 70;
      const boxX = pageWidth - margin - boxW;
      const boxY = lineY + 6;
      doc.setDrawColor(...colors.border);
      doc.setLineWidth(0.8);
      doc.roundedRect(boxX, boxY, boxW, boxH, 8, 8);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const labelX = boxX + 12;
      const valueX = boxX + boxW - 12;
      doc.setTextColor(...colors.text);
      doc.text(`Valor (${itemsCount} produto${itemsCount === 1 ? "" : "s"})`, labelX, boxY + 18);
      doc.text(formatCurrency(valorSemTaxas), valueX, boxY + 18, { align: "right" });
      doc.text("Taxas e impostos", labelX, boxY + 34);
      doc.text(formatCurrency(taxesTotal), valueX, boxY + 34, { align: "right" });
      if (hasDiscount) {
        doc.text("Desconto", labelX, boxY + 50);
        doc.text(formatCurrency(-discountValue), valueX, boxY + 50, { align: "right" });
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      const totalLineY = hasDiscount ? boxY + 72 : boxY + 56;
      doc.text("Total de", labelX, totalLineY);
      doc.text(formatCurrency(totalValue), valueX, totalLineY, { align: "right" });
      curY = Math.max(lineY + 22, boxY + boxH + 18);
    } else {
      curY = lineY + 22;
    }
    doc.setTextColor(...colors.text);
  }

  function drawSectionTitle(
    title: string,
    opts: { openContentCard?: boolean; iconKind?: PdfIconKind | null } = {}
  ) {
    const cleanTitle = String(title || "").replace(/\s*\(\*\)\s*/g, " ").replace(/\s+/g, " ").trim();

    // Título em um card separado e conteúdo em outro card (sem "card dentro de card")
    const titleCardMinHeight = cardPaddingTop + 30 + cardPaddingBottom + cardGapAfter;
    const minRoomForTitleAndSomeContent = titleCardMinHeight + minRoomForNewCard;
    if (curY + minRoomForTitleAndSomeContent > contentBottom) {
      doc.addPage();
      curY = margin;
      drawPageHeader();
    }

    // Card do título (standalone)
    const cardX = margin;
    const cardW = pageWidth - margin * 2;
    const startY = curY;
    curY += cardPaddingTop;

    const iconKind = opts.iconKind ?? getSectionIconKind(cleanTitle);
    const iconSize = 14;
    const iconGap = 8;
    const titleX = margin + cardPaddingX;
    const titleTextX = iconKind ? titleX + iconSize + iconGap : titleX;

    if (iconKind) {
      drawIcon(iconKind, titleX, curY + 4, colors.title, iconSize);
    }
    doc.setFont(bodyFont, "bold");
    doc.setFontSize(16);
    doc.setTextColor(...colors.title);
    doc.text(cleanTitle, titleTextX, curY + 16);
    curY += 30;

    const endY = curY + cardPaddingBottom;
    const h = Math.max(28, endY - startY);
    doc.setDrawColor(...cardBorder);
    doc.setLineWidth(0.8);
    doc.roundedRect(cardX, startY, cardW, h, cardRadius, cardRadius);
    curY = startY + h + cardGapAfter;

    // Card do conteúdo (separado, sem repetir título)
    if (opts.openContentCard !== false) {
      openCard(cleanTitle, cardPaddingX, { showTitle: false });
    }
  }

  function drawTextBlock(
    text: string,
    indent = 0,
    rightIndent = 0,
    textColor: [number, number, number] = colors.muted
  ) {
    const width = pageWidth - margin * 2 - indent - rightIndent;
    doc.setFont(bodyFont, "normal");
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(...textColor);

    // Placeholder: onde houver "(*)", desenhar um box vazio (borda cinza clara)
    const chunks = String(text || "").split("(*)");
    if (chunks.length <= 1) {
      const lines = doc.splitTextToSize(text, width);
      lines.forEach((line: string) => {
        ensureSpace(bodyLineHeight);
        doc.text(line, margin + indent, curY + bodyFontSize);
        curY += bodyLineHeight;
      });
      return;
    }

    chunks.forEach((chunk, idx) => {
      const content = (chunk || "").trim();
      if (content) {
        const lines = doc.splitTextToSize(content, width);
        lines.forEach((line: string) => {
          ensureSpace(bodyLineHeight);
          doc.text(line, margin + indent, curY + bodyFontSize);
          curY += bodyLineHeight;
        });
      }

      if (idx < chunks.length - 1) {
        const boxH = 56;
        ensureSpace(boxH + 12);
        // box interno (placeholder) — sem cara de "card"
        doc.setDrawColor(209, 213, 219);
        doc.setLineWidth(0.6);
        doc.rect(margin + indent, curY + 6, width, boxH);
        curY += boxH + 16;
      }
    });
  }

  function drawItineraryInlineBlock(
    header: string,
    description: string,
    indent = 0,
    rightIndent = 0,
    textColor: [number, number, number] = [0, 0, 0]
  ) {
    const cleanHeader = String(header || "").trim();
    const cleanDescription = String(description || "").trim();
    if (!cleanHeader && !cleanDescription) return;

    const x = margin + indent;
    const width = pageWidth - margin * 2 - indent - rightIndent;

    if (!cleanHeader) {
      drawTextBlock(cleanDescription, indent, rightIndent, textColor);
      return;
    }

    if (!cleanDescription) {
      ensureSpace(bodyLineHeight);
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(bodyFontSize);
      doc.setTextColor(...textColor);
      doc.text(cleanHeader, x, curY + bodyFontSize);
      curY += bodyLineHeight;
      return;
    }

    const headerPrefix = `${cleanHeader} - `;
    doc.setFont(bodyFont, "bold");
    doc.setFontSize(bodyFontSize);
    const headerWidth = doc.getTextWidth(headerPrefix);

    const minDescriptionWidth = 110;
    if (headerWidth > width - minDescriptionWidth) {
      const headerLines = doc.splitTextToSize(headerPrefix.trim(), width);
      headerLines.forEach((line: string) => {
        ensureSpace(bodyLineHeight);
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(...textColor);
        doc.text(line, x, curY + bodyFontSize);
        curY += bodyLineHeight;
      });
      drawTextBlock(cleanDescription, indent, rightIndent, textColor);
      return;
    }

    const words = cleanDescription.split(/\s+/).filter(Boolean);
    const firstLineAvailableWidth = Math.max(width - headerWidth, 40);
    doc.setFont(bodyFont, "normal");
    doc.setFontSize(bodyFontSize);

    let firstLineDescription = "";
    let consumedWords = 0;
    for (let i = 0; i < words.length; i++) {
      const candidate = firstLineDescription ? `${firstLineDescription} ${words[i]}` : words[i];
      if (doc.getTextWidth(candidate) <= firstLineAvailableWidth) {
        firstLineDescription = candidate;
        consumedWords = i + 1;
      } else {
        break;
      }
    }

    if (!firstLineDescription && words.length > 0) {
      firstLineDescription = words[0];
      consumedWords = 1;
    }

    ensureSpace(bodyLineHeight);
    doc.setFont(bodyFont, "bold");
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(...textColor);
    doc.text(headerPrefix, x, curY + bodyFontSize);

    doc.setFont(bodyFont, "normal");
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(...textColor);
    doc.text(firstLineDescription, x + headerWidth, curY + bodyFontSize);
    curY += bodyLineHeight;

    const remaining = words.slice(consumedWords).join(" ");
    if (remaining) {
      const lines = doc.splitTextToSize(remaining, width);
      lines.forEach((line: string) => {
        ensureSpace(bodyLineHeight);
        doc.setFont(bodyFont, "normal");
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(...textColor);
        doc.text(line, x, curY + bodyFontSize);
        curY += bodyLineHeight;
      });
    }
  }

  function drawBlankBox(height: number, indent = 0) {
    const width = pageWidth - margin * 2 - indent;
    ensureSpace(height + 12);
    // box interno (placeholder) — sem cara de "card"
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.6);
    doc.rect(margin + indent, curY + 6, width, height);
    curY += height + 16;
  }

  function drawCityHeading(text: string, indent = 0) {
    const heading = String(text || "").trim();
    if (!heading) return;
    const iconSize = 12;
    const iconGap = 8;
    const headingX = margin + indent;
    const textX = headingX + iconSize + iconGap;
    const maxWidth = pageWidth - margin * 2 - indent - iconSize - iconGap;
    const headingColor = colors.muted;
    doc.setFont(bodyFont, "bold");
    doc.setFontSize(13);
    doc.setTextColor(...headingColor);
    const lines = doc.splitTextToSize(heading, maxWidth);
    lines.forEach((line: string, index: number) => {
      ensureSpace(bodyLineHeight + 2);
      if (index === 0) {
        drawIcon("city", headingX, curY + 2, headingColor, iconSize);
      }
      doc.text(line, textX, curY + 12);
      curY += bodyLineHeight + 1;
    });
  }

  function drawArrowRightMarker(x: number, y: number, color: [number, number, number], size = 10) {
    const s = Math.max(size, 8);
    const midY = y + s * 0.5;
    const shaftStartX = x;
    const shaftEndX = x + s * 0.56;
    doc.setDrawColor(...color);
    doc.setFillColor(...color);
    doc.setLineWidth(0.9);
    doc.line(shaftStartX, midY, shaftEndX, midY);
    doc.triangle(
      shaftEndX,
      midY - s * 0.28,
      x + s,
      midY,
      shaftEndX,
      midY + s * 0.28,
      "F"
    );
  }

  function drawCenteredTitle() {
    const title = String(roteiro.titulo_documento || "Roteiro Personalizado").trim();
    const subtitle = String(roteiro.subtitulo_documento || roteiro.nome || "").trim();

    openCard(title, cardPaddingX, { showTitle: false });

    doc.setFont(bodyFont, "bold");
    doc.setFontSize(18);
    doc.setTextColor(...colors.title);
    ensureSpace(28);
    doc.text(title, margin + cardPaddingX, curY + 18);
    curY += 30;

    if (subtitle) {
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(15);
      doc.setTextColor(...colors.text);
      ensureSpace(22);
      doc.text(subtitle, margin + cardPaddingX, curY + 15);
      curY += 22;
    }

    closeCard({ addGapAfter: true });
  }

  function drawKeyValueLine(label: string, value: string, x = margin) {
    if (!value) return;
    ensureSpace(bodyLineHeight);
    doc.setFont(bodyFont, "bold");
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(...colors.text);
    const labelText = `${label}: `;
    doc.text(labelText, x, curY + bodyFontSize);
    const labelW = doc.getTextWidth(labelText);
    doc.setFont(bodyFont, "normal");
    doc.setTextColor(...colors.muted);
    const lines = doc.splitTextToSize(value, pageWidth - margin - x - labelW);
    lines.forEach((line: string, idx: number) => {
      ensureSpace(bodyLineHeight);
      doc.text(line, x + labelW, curY + bodyFontSize);
      curY += bodyLineHeight;
      if (idx < lines.length - 1) {
        doc.setFont(bodyFont, "normal");
      }
    });
  }

  function drawBulletList(items: Array<{ label: string; value: string }>, indent = 0) {
    const bulletRadius = 1.4;
    const bulletGap = 8;
    const bulletX = margin + indent + 2;
    const textX = bulletX + bulletGap;
    const maxWidth = pageWidth - margin * 2 - indent - bulletGap;
    const labelColor = colors.text;
    const valueColor = colors.muted;
    const bulletColor = colors.muted;

    items
      .filter((i) => Boolean(i.value))
      .forEach((item) => {
        const labelText = item.label ? `${item.label}: ` : "";
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(...labelColor);
        const labelW = labelText ? doc.getTextWidth(labelText) : 0;

        doc.setFont(bodyFont, "normal");
        doc.setTextColor(...valueColor);
        const lines = doc.splitTextToSize(item.value, maxWidth - labelW);
        if (!lines.length) return;

        // first line
        ensureSpace(bodyLineHeight);
        doc.setFillColor(...bulletColor);
        doc.circle(bulletX, curY + bodyFontSize - 4, bulletRadius, "F");
        if (labelText) {
          doc.setFont(bodyFont, "bold");
          doc.setTextColor(...labelColor);
          doc.text(labelText, textX, curY + bodyFontSize);
        }
        doc.setFont(bodyFont, "normal");
        doc.setTextColor(...valueColor);
        doc.text(String(lines[0]), textX + labelW, curY + bodyFontSize);
        curY += bodyLineHeight;

        // wrapped lines
        for (let idx = 1; idx < lines.length; idx++) {
          ensureSpace(bodyLineHeight);
          doc.text(String(lines[idx]), textX + labelW, curY + bodyFontSize);
          curY += bodyLineHeight;
        }
      });
  }

  function drawBulletKeyValueList(items: Array<{ label: string; value: string }>, indent = 0) {
    const bulletRadius = 1.4;
    const bulletGap = 8;
    const bulletX = margin + indent + 2;
    const textX = bulletX + bulletGap;
    const maxWidth = pageWidth - margin * 2 - indent - bulletGap;
    const filteredItems = items.filter((item) => Boolean(String(item.value || "").trim()));
    const labelColumnWidth = filteredItems.reduce((max, item) => {
      const labelText = item.label ? `${item.label}: ` : "";
      if (!labelText) return max;
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(bodyFontSize);
      return Math.max(max, doc.getTextWidth(labelText));
    }, 0) + 4;
    const valueX = textX + labelColumnWidth;

    filteredItems.forEach((item) => {
        const labelText = item.label ? `${item.label}: ` : "";

        doc.setFont(bodyFont, "bold");
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(...colors.text);

        doc.setFont(bodyFont, "normal");
        doc.setTextColor(...colors.muted);
        const lines = doc.splitTextToSize(String(item.value || "").trim(), Math.max(maxWidth - labelColumnWidth, 40));
        if (!lines.length) return;

        ensureSpace(bodyLineHeight);
        doc.setFillColor(...colors.muted);
        doc.circle(bulletX, curY + bodyFontSize - 4, bulletRadius, "F");

        if (labelText) {
          doc.setFont(bodyFont, "bold");
          doc.setTextColor(...colors.text);
          doc.text(labelText, textX, curY + bodyFontSize);
        }

        doc.setFont(bodyFont, "normal");
        doc.setTextColor(...colors.muted);
        doc.text(String(lines[0]), valueX, curY + bodyFontSize);
        curY += bodyLineHeight;

        for (let idx = 1; idx < lines.length; idx++) {
          ensureSpace(bodyLineHeight);
          doc.text(String(lines[idx]), valueX, curY + bodyFontSize);
          curY += bodyLineHeight;
        }
      });
  }

  function drawChecklist(items: string[], indent = 0, kind: "check" | "x") {
    const boxSize = 10;
    const gap = 8;
    const xBox = margin + indent;
    const xText = xBox + boxSize + gap;
    const maxWidth = pageWidth - margin * 2 - indent - boxSize - gap;

    const drawMark = (x: number, y: number) => {
      doc.setLineWidth(1.2);
      doc.setDrawColor(60);
      if (kind === "check") {
        // checked
        doc.line(x + 2, y + 6, x + 4.3, y + 8.5);
        doc.line(x + 4.3, y + 8.5, x + 8.5, y + 2.5);
      } else {
        // unchecked
        doc.line(x + 2.2, y + 2.2, x + 8, y + 8);
        doc.line(x + 8, y + 2.2, x + 2.2, y + 8);
      }
    };

    doc.setFont(bodyFont, "normal");
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(...colors.muted);

    const filtered = items
      .map((i) => String(i || "").trim())
      .filter(Boolean);

    filtered.forEach((item, itemIdx) => {
        const lines = doc.splitTextToSize(item, maxWidth);
        if (!lines.length) return;

        ensureSpace(bodyLineHeight);
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.9);
      doc.roundedRect(xBox, curY + 3, boxSize, boxSize, 2, 2);
      drawMark(xBox, curY + 3);
        doc.text(String(lines[0]), xText, curY + bodyFontSize);
        curY += bodyLineHeight;

        for (let idx = 1; idx < lines.length; idx++) {
          ensureSpace(bodyLineHeight);
          doc.text(String(lines[idx]), xText, curY + bodyFontSize);
          curY += bodyLineHeight;
        }

        if (itemIdx < filtered.length - 1) curY += 6;
      });
  }

  function formatDateRangeLong(start?: Date | null, end?: Date | null) {
    if (!start || !end) return "";
    const sameMonth = start.getMonth() === end.getMonth();
    const sameYear = start.getFullYear() === end.getFullYear();
    if (sameMonth && sameYear) {
      const monthYear = end.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      return `${start.getDate()} a ${end.getDate()} de ${monthYear}`;
    }
    return `${formatDateLong(start)} a ${formatDateLong(end)}`;
  }

  function collectCities() {
    const diasOrdenadosLocais = normalizeDiasForPdf(roteiro.dias || []);
    const seen = new Set<string>();
    const cities: string[] = [];
    const addFormatted = (value?: string | null) => {
      const v = formatBudgetItemText(value);
      if (!v) return;
      const key = normalizeLookup(v);
      if (!key || seen.has(key)) return;
      seen.add(key);
      cities.push(v);
    };
    const splitPercurso = (value?: string | null) =>
      String(value || "")
        .split("-")
        .map((part) => formatBudgetItemText(part))
        .map((part) => String(part || "").trim())
        .filter(Boolean);

    const add = (value?: string | null) => {
      const v = formatBudgetItemText(value);
      if (!v) return;
      const key = normalizeLookup(v);
      if (seen.has(key)) return;
      seen.add(key);
      cities.push(v);
    };

    // 1) Prioriza cidades vindas do itinerário (ordem real da viagem)
    diasOrdenadosLocais.forEach((dia) => {
      const percurso = textValue((dia as any).percurso);
      const percursoParts = splitPercurso(percurso);
      if (percursoParts.length > 1) {
        percursoParts.forEach((part) => addFormatted(part));
        return;
      }
      addFormatted(dia.cidade);
      if (!textValue(dia.cidade)) addFormatted(percurso);
    });

    // 2) Complementa com hotéis e passeios
    (roteiro.hoteis || []).forEach((h) => add(h.cidade));
    (roteiro.passeios || []).forEach((p) => add(p.cidade));

    // 3) Remove cidade de origem/base (primeiro dia e último dia)
    const firstDia = diasOrdenadosLocais[0];
    const lastDia = diasOrdenadosLocais[diasOrdenadosLocais.length - 1];
    const firstParts = splitPercurso((firstDia as any)?.percurso);
    const lastParts = splitPercurso((lastDia as any)?.percurso);
    const origemPrimeiroDia =
      firstParts[0] ||
      formatBudgetItemText(roteiro.inicio_cidade) ||
      formatBudgetItemText(firstDia?.cidade);
    const destinoUltimoDia =
      lastParts[lastParts.length - 1] ||
      formatBudgetItemText(roteiro.fim_cidade) ||
      formatBudgetItemText(lastDia?.cidade);
    const baseKeys = new Set(
      [origemPrimeiroDia, destinoUltimoDia]
        .map((value) => normalizeLookup(value))
        .filter(Boolean)
    );

    const filteredCities = cities.filter((cidade) => !baseKeys.has(normalizeLookup(cidade)));
    if (cities.length > 0) return filteredCities;

    // fallback de segurança
    if (cities.length === 0) {
      (roteiro.dias || [])
        .slice()
        .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .forEach((d) => {
          const cidade = textValue(d.cidade);
          const percurso = textValue((d as any).percurso);
          if (!cidade) return;
          if (!percurso || normalizeLookup(percurso) === normalizeLookup(cidade)) {
            add(cidade);
          }
        });
    }

    return cities;
  }

  function formatCitiesPt(cities: string[]) {
    if (!cities.length) return "";
    if (cities.length === 1) return cities[0];
    if (cities.length === 2) return `${cities[0]} e ${cities[1]}`;
    return `${cities.slice(0, -1).join(", ")} e ${cities[cities.length - 1]}`;
  }

  function toDateOrNull(value?: string | null) {
    if (!value) return null;
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function drawPageNumber(pageNumber: number, totalPages: number) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...colors.muted);
    doc.text(`Pagina ${pageNumber} de ${totalPages}`, pageWidth / 2, pageNumberY, {
      align: "center",
    });
  }

  // Cabeçalho (padrão do Orçamento)
  drawPageHeader();

  // Título centralizado (como no modelo)
  if (!resumoOrcamento) {
    drawCenteredTitle();
  }

  // Bloco de resumo textual (cidades / período) em card
  const diasOrdenados = normalizeDiasForPdf(roteiro.dias || []);
  const cities = collectCities();
  const citiesLine = formatCitiesPt(cities);

  openCard("Resumo", cardPaddingX, { showTitle: false });
  let hasSummaryContent = false;
  if (citiesLine) {
    doc.setFont(bodyFont, "bold");
    doc.setFontSize(13);
    doc.setTextColor(...colors.text);
    ensureSpace(18);
    doc.text(citiesLine, margin + cardPaddingX, curY + 13);
    curY += 20;
    hasSummaryContent = true;
  }

  const dateCandidates: Date[] = [];
  const pushDate = (d: Date | null) => {
    if (!d) return;
    dateCandidates.push(d);
  };
  diasOrdenados.forEach((d) => pushDate(toDateOrNull(d.data || null)));
  (roteiro.hoteis || []).forEach((h) => {
    pushDate(toDateOrNull(h.data_inicio || null));
    pushDate(toDateOrNull(h.data_fim || null));
  });
  (roteiro.passeios || []).forEach((p) => {
    pushDate(toDateOrNull(p.data_inicio || null));
    pushDate(toDateOrNull(p.data_fim || null));
  });
  (roteiro.transportes || []).forEach((t) => {
    pushDate(toDateOrNull(t.data_inicio || null));
    pushDate(toDateOrNull(t.data_fim || null));
  });

  let startDate: Date | null = null;
  let endDate: Date | null = null;
  if (dateCandidates.length) {
    startDate = dateCandidates.reduce((min, d) => (d.getTime() < min.getTime() ? d : min), dateCandidates[0]);
    endDate = dateCandidates.reduce((max, d) => (d.getTime() > max.getTime() ? d : max), dateCandidates[0]);
  }

  const periodText = (() => {
    if (startDate && endDate) {
      const msPerDay = 24 * 60 * 60 * 1000;
      const daysCount = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1);
      const nightsCount = Math.max(0, daysCount - 1);
      const rangeLabel = formatDateRangeLong(startDate, endDate);
      const durLabel = `(${daysCount} dias / ${nightsCount} noites)`;
      return `${rangeLabel} ${durLabel}`.trim();
    }
    if (roteiro.duracao) return `${roteiro.duracao} dias`;
    return "";
  })();

  if (periodText) {
    doc.setFont(bodyFont, "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...colors.text);
    const label = "Período: ";
    ensureSpace(18);
    doc.text(label, margin + cardPaddingX, curY + 13);
    const labelW = doc.getTextWidth(label);
    doc.setFont(bodyFont, "normal");
    const lines = doc.splitTextToSize(periodText, pageWidth - margin * 2 - cardPaddingX - labelW);
    if (lines.length) {
      doc.text(String(lines[0]), margin + cardPaddingX + labelW, curY + 13);
      curY += 18;
      for (let i = 1; i < lines.length; i++) {
        ensureSpace(18);
        doc.text(String(lines[i]), margin + cardPaddingX, curY + 13);
        curY += 18;
      }
    }
    hasSummaryContent = true;
  }

  if (hasSummaryContent) {
    closeCard({ addGapAfter: true });
  } else {
    closeCard({ addGapAfter: false });
  }

  curY += 10;

  // Itinerário Detalhado
  if (diasOrdenados.length > 0) {
    drawSectionTitle("Itinerário Detalhado");
    diasOrdenados.forEach((dia, idx) => {
      const dateLabel = formatDate(dia.data);
      const percurso = String((dia as any).percurso || "").trim();
      const cidade = (dia.cidade || "").trim();
      const place = formatBudgetItemText(percurso) || formatBudgetItemText(cidade);
      const header = [dateLabel, `Dia ${idx + 1}${place ? `: ${place}` : ""}`].filter(Boolean).join(" — ");
      const descricaoNormalizada = formatBudgetItemText(String(dia.descricao || "").trim());

      drawItineraryInlineBlock(
        header || `Dia ${idx + 1}`,
        descricaoNormalizada,
        activeCardIndent,
        activeCardIndent,
        colors.muted
      );
      curY += 8;
    });
    closeCard({ addGapAfter: true });
  }

  // Hotéis Sugeridos
  const hoteis = (roteiro.hoteis || []).filter((h) => hasMeaningfulHotel(h));
  if (hoteis.length > 0) {
    drawSectionTitle("Hotéis Sugeridos", { openContentCard: false });
    const groupedHoteis = groupHoteisByCidadeForPdf(hoteis);

    groupedHoteis.forEach((group) => {
      const hotelHeaderFontSize = bodyFontSize;
      const hotelBodyFontSize = bodyFontSize;
      const cardIndent = cardPaddingX;
      const tableWidth = pageWidth - margin * 2 - cardIndent - 8;
      const columnGap = 12;
      const columnsContentWidth = tableWidth - columnGap * 5;
      const columns = [
        { key: "hotel", label: "Nome Hotel", width: columnsContentWidth * 0.29 },
        { key: "de", label: "Período de", width: columnsContentWidth * 0.13 },
        { key: "ate", label: "Período até", width: columnsContentWidth * 0.13 },
        { key: "noites", label: "Noites", width: columnsContentWidth * 0.10 },
        { key: "acomodacao", label: "Acomodação", width: columnsContentWidth * 0.21 },
        { key: "regime", label: "Regime", width: columnsContentWidth * 0.14 },
      ] as const;
      const hotelNoWrapColumns = new Set(["de", "ate", "noites"]);
      const hotelCenteredColumns = new Set(["de", "ate", "noites", "acomodacao", "regime"]);
      const hotelRows = group.items.map((h) => {
        const noites = Number.isFinite(Number(h.noites))
          ? Number(h.noites)
          : (() => {
              const di = toDateOrNull(h.data_inicio || null);
              const df = toDateOrNull(h.data_fim || null);
              return (di && df) ? Math.max(0, Math.round((df.getTime() - di.getTime()) / (24 * 60 * 60 * 1000))) : 0;
            })();

        return {
          hotel: formatBudgetItemText(h.hotel),
          de: formatDate(h.data_inicio),
          ate: formatDate(h.data_fim),
          noites: noites > 0 ? String(noites) : "",
          acomodacao: formatBudgetItemText(h.apto),
          regime: formatBudgetItemText(h.regime),
        } as const;
      });

      const cityHeadingLines = doc.splitTextToSize(
        String(group.cidade || "Hospedagem"),
        pageWidth - margin * 2 - cardIndent - 20
      );
      const estimatedHotelRowsHeight = hotelRows.reduce((sum, row) => {
        const lineCounts = columns.map((column) => {
          const value = String(row[column.key] || "") || "-";
          if (hotelNoWrapColumns.has(String(column.key))) return 1;
          doc.setFont(bodyFont, "normal");
          doc.setFontSize(hotelBodyFontSize);
          return doc.splitTextToSize(value, Math.max(column.width - 2, 28)).length || 1;
        });
        return sum + Math.max(...lineCounts, 1) * bodyLineHeight + 6;
      }, 0);
      const estimatedHotelCardHeight =
        cardPaddingTop +
        10 +
        cityHeadingLines.length * (bodyLineHeight + 1) +
        10 +
        (bodyLineHeight + 10) +
        estimatedHotelRowsHeight +
        8 +
        cardPaddingBottom;
      ensureRoomForStandaloneCard(estimatedHotelCardHeight);
      openCard(`Hotéis Sugeridos - ${group.cidade || "Hospedagem"}`, cardIndent, { showTitle: false });

      const hotelHeaderSegments = columns.map((column) => {
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(hotelHeaderFontSize);
        let maxWidth = doc.getTextWidth(column.label);

        doc.setFont(bodyFont, "normal");
        doc.setFontSize(hotelBodyFontSize);
        hotelRows.forEach((row) => {
          const value = String(row[column.key] || "") || "-";
          const lines = hotelNoWrapColumns.has(String(column.key))
            ? [value]
            : doc.splitTextToSize(value, Math.max(column.width - 2, 28));
          lines.forEach((line: string) => {
            maxWidth = Math.max(maxWidth, doc.getTextWidth(String(line)));
          });
        });

        return Math.min(column.width, maxWidth + 4);
      });

      const drawHotelTableHeader = () => {
        ensureSpace(24);
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(hotelHeaderFontSize);
        doc.setTextColor(...colors.muted);
        let colX = margin + activeCardIndent;
        columns.forEach((column, index) => {
          const y = curY + bodyFontSize + 1;
          if (hotelCenteredColumns.has(String(column.key))) {
            doc.text(column.label, colX + column.width / 2, y, { align: "center" });
          } else {
            doc.text(column.label, colX, y);
          }
          colX += column.width + (index < columns.length - 1 ? columnGap : 0);
        });
        doc.setDrawColor(209, 213, 219);
        doc.setLineWidth(0.45);
        const lineY = curY + bodyLineHeight + 5;
        let lineColX = margin + activeCardIndent;
        columns.forEach((column, index) => {
          const segmentWidth = hotelHeaderSegments[index];
          const segmentX = hotelCenteredColumns.has(String(column.key))
            ? lineColX + Math.max((column.width - segmentWidth) / 2, 0)
            : lineColX;
          doc.line(segmentX, lineY, segmentX + segmentWidth, lineY);
          lineColX += column.width + (index < columns.length - 1 ? columnGap : 0);
        });
        curY += bodyLineHeight + 10;
      };

      drawCityHeading(group.cidade || "Hospedagem", activeCardIndent);
      curY += 10;
      drawHotelTableHeader();

      hotelRows.forEach((row) => {
        const beforeEnsure = curY;
        ensureSpace(24);
        if (curY < beforeEnsure) {
          drawCityHeading(group.cidade || "Hospedagem", activeCardIndent);
          curY += 10;
          drawHotelTableHeader();
        }

        doc.setFont(bodyFont, "normal");
        doc.setFontSize(hotelBodyFontSize);
        doc.setTextColor(...colors.muted);

        const rowHeights = columns.map((column) => {
          const value = String(row[column.key] || "") || "-";
          const lines = hotelNoWrapColumns.has(String(column.key)) ? [value] : doc.splitTextToSize(value, Math.max(column.width - 2, 28));
          return lines.length;
        });
        const lineCount = Math.max(...rowHeights, 1);
        const rowHeight = lineCount * bodyLineHeight;

        let colX = margin + activeCardIndent;
        columns.forEach((column, index) => {
          const value = String(row[column.key] || "") || "-";
          const lines = hotelNoWrapColumns.has(String(column.key)) ? [value] : doc.splitTextToSize(value, Math.max(column.width - 2, 28));
          lines.forEach((line: string, lineIndex: number) => {
            const y = curY + bodyFontSize + 1 + lineIndex * bodyLineHeight;
            if (hotelCenteredColumns.has(String(column.key))) {
              doc.text(line, colX + column.width / 2, y, { align: "center" });
            } else {
              doc.text(line, colX, y);
            }
          });
          colX += column.width + (index < columns.length - 1 ? columnGap : 0);
        });
        curY += rowHeight + 6;
      });

      curY += 8;
      closeCard({ addGapAfter: true });
    });
  }

  // Passeios e Serviços
  const passeios = (roteiro.passeios || []).filter((p) => hasMeaningfulPasseio(p));
  if (passeios.length > 0) {
    drawSectionTitle("Passeios e Serviços", { openContentCard: false });
    const groupedPasseios = groupPasseiosByCidadeForPdf(passeios);
    const roteiroCitiesLabel = cities.length > 0 ? cities.join(" - ") : "";
    groupedPasseios.forEach((group) => {
      const groupHasSeguro = group.items.some((item) => isSeguroPasseioLike(item as any));
      const groupCidadeNormalized = normalizeCompare(group.cidade);
      const isGenericServiceGroup = !groupCidadeNormalized || groupCidadeNormalized === "servicos";
      const displayCidade = groupHasSeguro && isGenericServiceGroup && roteiroCitiesLabel
        ? roteiroCitiesLabel
        : (group.cidade || "Serviços");

      const passeioHeaderFontSize = bodyFontSize;
      const passeioBodyFontSize = bodyFontSize;
      const cardIndent = cardPaddingX;
      const tableWidth = pageWidth - margin * 2 - cardIndent - 8;
      const columnGap = 12;
      const columnsContentWidth = tableWidth - columnGap * 2;
      const columns = [
        { key: "data", label: "Data", width: columnsContentWidth * 0.16 },
        { key: "descricao", label: "Descrição", width: columnsContentWidth * 0.62 },
        { key: "ingressos", label: "Ingressos", width: columnsContentWidth * 0.22 },
      ] as const;
      const passeioRows = group.items.map((p) => {
        const di = toDateOrNull(p.data_inicio || null);
        const df = toDateOrNull(p.data_fim || null);
        const data = di && df
          ? (formatDate(p.data_inicio) === formatDate(p.data_fim) ? formatDate(p.data_inicio) : `${formatDate(p.data_inicio)} a ${formatDate(p.data_fim)}`)
          : formatDate(p.data_inicio) || formatDate(p.data_fim);
        return {
          data: data || "",
          descricao: formatBudgetItemText(p.passeio),
          ingressos: formatBudgetItemText(p.ingressos),
        } as const;
      });

      const cityHeadingLines = doc.splitTextToSize(
        String(displayCidade || "Serviços"),
        pageWidth - margin * 2 - cardIndent - 20
      );
      const estimatedPasseioRowsHeight = passeioRows.reduce((sum, row) => {
        const lineCounts = columns.map((column) => {
          const value = String(row[column.key] || "") || "-";
          doc.setFont(bodyFont, "normal");
          doc.setFontSize(passeioBodyFontSize);
          return doc.splitTextToSize(value, Math.max(column.width - 2, 40)).length || 1;
        });
        return sum + Math.max(...lineCounts, 1) * bodyLineHeight + 4;
      }, 0);
      const estimatedPasseioCardHeight =
        cardPaddingTop +
        10 +
        cityHeadingLines.length * (bodyLineHeight + 1) +
        10 +
        (bodyLineHeight + 10) +
        estimatedPasseioRowsHeight +
        8 +
        cardPaddingBottom;
      ensureRoomForStandaloneCard(estimatedPasseioCardHeight);
      openCard(`Passeios e Serviços - ${displayCidade}`, cardIndent, { showTitle: false });

      const passeioHeaderSegments = columns.map((column) => {
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(passeioHeaderFontSize);
        let maxWidth = doc.getTextWidth(column.label);

        doc.setFont(bodyFont, "normal");
        doc.setFontSize(passeioBodyFontSize);
        passeioRows.forEach((row) => {
          const value = String(row[column.key] || "") || "-";
          const lines = doc.splitTextToSize(value, Math.max(column.width - 2, 40));
          lines.forEach((line: string) => {
            maxWidth = Math.max(maxWidth, doc.getTextWidth(String(line)));
          });
        });

        return Math.min(column.width, maxWidth + 4);
      });

      const drawPasseioTableHeader = () => {
        ensureSpace(24);
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(passeioHeaderFontSize);
        doc.setTextColor(...colors.muted);
        let colX = margin + activeCardIndent;
        columns.forEach((column, index) => {
          doc.text(column.label, colX, curY + bodyFontSize + 1);
          colX += column.width + (index < columns.length - 1 ? columnGap : 0);
        });
        doc.setDrawColor(209, 213, 219);
        doc.setLineWidth(0.45);
        const lineY = curY + bodyLineHeight + 5;
        let lineColX = margin + activeCardIndent;
        columns.forEach((column, index) => {
          const segmentWidth = passeioHeaderSegments[index];
          doc.line(lineColX, lineY, lineColX + segmentWidth, lineY);
          lineColX += column.width + (index < columns.length - 1 ? columnGap : 0);
        });
        curY += bodyLineHeight + 10;
      };

      drawCityHeading(displayCidade, activeCardIndent);
      curY += 10;
      drawPasseioTableHeader();

      passeioRows.forEach((row) => {
        const beforeEnsure = curY;
        ensureSpace(24);
        if (curY < beforeEnsure) {
          drawCityHeading(displayCidade, activeCardIndent);
          curY += 10;
          drawPasseioTableHeader();
        }

        doc.setFont(bodyFont, "normal");
        doc.setFontSize(passeioBodyFontSize);
        doc.setTextColor(...colors.muted);

        const rowHeights = columns.map((column) => {
          const value = String(row[column.key] || "");
          const lines = doc.splitTextToSize(value || "-", Math.max(column.width - 2, 40));
          return lines.length;
        });
        const lineCount = Math.max(...rowHeights, 1);
        const rowHeight = lineCount * bodyLineHeight;

        let colX = margin + activeCardIndent;
        columns.forEach((column, index) => {
          const value = String(row[column.key] || "") || "-";
          const lines = doc.splitTextToSize(value, Math.max(column.width - 2, 40));
          lines.forEach((line: string, lineIndex: number) => {
            doc.text(line, colX, curY + bodyFontSize + 1 + lineIndex * bodyLineHeight);
          });
          colX += column.width + (index < columns.length - 1 ? columnGap : 0);
        });
        curY += rowHeight + 4;
      });

      curY += 8;
      closeCard({ addGapAfter: true });
    });
  }

  // Passagem Aérea
  const transportes = (roteiro.transportes || []).filter((t) => hasMeaningfulTransporte(t));
  if (transportes.length > 0) {
    drawSectionTitle("Passagem Aérea");
    const labelX = margin + activeCardIndent;
    const flightHeaderFontSize = bodyFontSize;
    const flightBodyFontSize = bodyFontSize;
    const tableWidth = pageWidth - margin * 2 - activeCardIndent - 8;
    const columnGap = 12;
    const columnsContentWidth = tableWidth - columnGap * 5;
    const columnFractions = [0.4, 1.62, 0.94, 1.62, 0.94, 1.34];
    const fractionSum = columnFractions.reduce((sum, value) => sum + value, 0);
    const columns = [
      { key: "cia", label: "Cia", width: columnsContentWidth * (columnFractions[0] / fractionSum) },
      { key: "de", label: "Origem", width: columnsContentWidth * (columnFractions[1] / fractionSum) },
      { key: "data_origem", label: "Saída", width: columnsContentWidth * (columnFractions[2] / fractionSum) },
      { key: "para", label: "Destino", width: columnsContentWidth * (columnFractions[3] / fractionSum) },
      { key: "data_destino", label: "Chegada", width: columnsContentWidth * (columnFractions[4] / fractionSum) },
      { key: "horarios", label: "Saída / Chegada", width: columnsContentWidth * (columnFractions[5] / fractionSum) },
    ] as const;
    const flightColumnTextOffset = (columnKey: (typeof columns)[number]["key"]) => (columnKey === "de" ? 7 : 0);
    const getFlightAvailableWidth = (column: (typeof columns)[number]) =>
      Math.max(column.width - 2 - flightColumnTextOffset(column.key), 8);
    const flightRows = transportes.map((t) => {
      const trecho = splitTrechoCities(t.trecho);
      const horaSaida = textValue(t.hora_saida);
      const horaChegada = textValue(t.hora_chegada);
      const horarios = horaSaida && horaChegada
        ? `${horaSaida} / ${horaChegada}`
        : (horaSaida || horaChegada);

      return {
        cia: resolveAirlineIata(t.cia_aerea, airlineLookup) || "-",
        cia_nome: textValue(t.cia_aerea),
        de: formatFlightPlace(trecho.origem, t.aeroporto_saida),
        data_origem: formatDate(t.data_voo || t.data_inicio),
        para: formatFlightPlace(trecho.destino, t.aeroporto_chegada),
        data_destino: formatDate(t.data_fim || t.data_voo || t.data_inicio),
        horarios,
      } as const;
    });

    const flightHeaderSegments = columns.map((column) => {
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(flightHeaderFontSize);
      const headerLabel = truncatePdfText(doc, column.label, getFlightAvailableWidth(column));
      let maxWidth = doc.getTextWidth(headerLabel);

      doc.setFont(bodyFont, "normal");
      doc.setFontSize(flightBodyFontSize);
      flightRows.forEach((row) => {
        const value = String(row[column.key] || "") || "-";
        const clipped = truncatePdfText(doc, value, getFlightAvailableWidth(column));
        maxWidth = Math.max(maxWidth, doc.getTextWidth(clipped));
      });

      return Math.min(column.width, maxWidth + 4);
    });

    const drawFlightHeader = () => {
      ensureSpace(24);
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(flightHeaderFontSize);
      doc.setTextColor(...colors.muted);
      let colX = labelX;
      columns.forEach((column, index) => {
        const textOffset = flightColumnTextOffset(column.key);
        const headerLabel = truncatePdfText(doc, column.label, getFlightAvailableWidth(column));
        doc.text(headerLabel, colX + textOffset, curY + bodyFontSize + 1);
        colX += column.width + (index < columns.length - 1 ? columnGap : 0);
      });
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.45);
      const lineY = curY + bodyLineHeight + 5;
      let lineColX = labelX;
      columns.forEach((column, index) => {
        const segmentWidth = flightHeaderSegments[index];
        const textOffset = flightColumnTextOffset(column.key);
        doc.line(lineColX + textOffset, lineY, lineColX + textOffset + segmentWidth, lineY);
        lineColX += column.width + (index < columns.length - 1 ? columnGap : 0);
      });
      curY += bodyLineHeight + 10;
    };

    drawFlightHeader();

    flightRows.forEach((row) => {
      const beforeEnsure = curY;
      ensureSpace(bodyLineHeight + 6);
      if (curY < beforeEnsure) {
        drawFlightHeader();
      }

      doc.setFont(bodyFont, "normal");
      doc.setFontSize(flightBodyFontSize);
      doc.setTextColor(...colors.muted);
      let colX = labelX;
      columns.forEach((column, index) => {
        const textOffset = flightColumnTextOffset(column.key);
        const value = String(row[column.key] || "");
        const clipped = truncatePdfText(doc, value, getFlightAvailableWidth(column));
        doc.text(clipped, colX + textOffset, curY + bodyFontSize + 1);
        colX += column.width + (index < columns.length - 1 ? columnGap : 0);
      });
      curY += bodyLineHeight + 2;
    });

    const airlineLegend = (() => {
      const seen = new Set<string>();
      const items: { code: string; name: string }[] = [];
      flightRows.forEach((row) => {
        const code = String(row.cia || "").trim().toUpperCase();
        if (!code || code === "-" || seen.has(code)) return;
        seen.add(code);
        const lookupName = resolveAirlineNameByIata(code, airlineLookup);
        const fallbackName = formatAirlineName(row.cia_nome);
        items.push({
          code,
          name: formatBudgetItemText(lookupName || fallbackName || code),
        });
      });
      return items;
    })();

    if (airlineLegend.length > 0) {
      const legendDividerSpaceTop = 10;
      const legendDividerSpaceBottom = 14;
      curY += legendDividerSpaceTop;
      ensureSpace(airlineLegend.length * bodyLineHeight + legendDividerSpaceTop + legendDividerSpaceBottom + 16);

      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.45);
      doc.line(labelX, curY, labelX + tableWidth, curY);
      curY += legendDividerSpaceBottom;

      const codeGap = 24;
      const nameMaxWidth = Math.max(tableWidth - codeGap - 2, 40);

      airlineLegend.forEach((item) => {
        const nameLines = doc.splitTextToSize(item.name, nameMaxWidth);
        const visibleLines = nameLines.length ? nameLines : ["-"];
        const rowHeight = Math.max(visibleLines.length * bodyLineHeight, bodyLineHeight);

        ensureSpace(rowHeight + 2);
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(flightBodyFontSize);
        doc.setTextColor(...colors.text);
        doc.text(item.code, labelX, curY + bodyFontSize + 1);

        doc.setFont(bodyFont, "normal");
        doc.setTextColor(...colors.muted);
        visibleLines.forEach((line: string, idx: number) => {
          const prefix = idx === 0 ? "= " : "  ";
          doc.text(`${prefix}${line}`, labelX + codeGap, curY + bodyFontSize + 1 + idx * bodyLineHeight);
        });
        curY += rowHeight + 2;
      });
    }

    curY += 6;
    closeCard({ addGapAfter: true });
  }

  // Investimento
  const investimentos = (roteiro.investimentos || []).filter((i) => hasMeaningfulInvestimento(i));
  const investimentoTotalApto = investimentos.reduce((sum, item) => {
    const valorPorPessoa = Number(item.valor_por_pessoa || 0);
    const qtdPax = Number(item.qtd_apto || 0);
    const valorPorApto = Number(item.valor_por_apto || 0);
    const safePessoa = Number.isFinite(valorPorPessoa) ? Math.max(valorPorPessoa, 0) : 0;
    const safeQtd = Number.isFinite(qtdPax) ? Math.max(qtdPax, 0) : 0;
    const safeApto = Number.isFinite(valorPorApto) ? Math.max(valorPorApto, 0) : 0;
    const totalItem = safeApto > 0 ? safeApto : Math.max(safePessoa * safeQtd, 0);
    return sum + totalItem;
  }, 0);
  if (investimentos.length > 0) {
    drawSectionTitle("Investimento");
    const invHeaderFontSize = bodyFontSize;
    const invBodyFontSize = bodyFontSize;
    const tableX = margin + activeCardIndent;
    const tableWidth = pageWidth - margin * 2 - activeCardIndent - 8;
    const columnGap = 12;
    const columnsContentWidth = tableWidth - columnGap * 3;
    const columns = [
      { key: "tipo", label: "Tipo", width: columnsContentWidth * 0.34 },
      { key: "valor_pessoa", label: "Valor por Pessoa", width: columnsContentWidth * 0.2 },
      { key: "qte_paxs", label: "Qte Paxs", width: columnsContentWidth * 0.12 },
      { key: "valor_apto", label: "Valor total por Apto", width: columnsContentWidth * 0.34 },
    ] as const;
    const centeredColumns = new Set(["valor_pessoa", "qte_paxs", "valor_apto"]);
    const investimentoRows = investimentos
      .map((item) => {
        const tipo = formatBudgetItemText(item.tipo) || "Tipo não informado";
        const valorPorPessoaNum = Number(item.valor_por_pessoa || 0);
        const qtdPaxsNum = Number(item.qtd_apto || 0);
        const valorPorAptoNum = Number(item.valor_por_apto || 0);
        const safeValorPessoa = Number.isFinite(valorPorPessoaNum) ? Math.max(valorPorPessoaNum, 0) : 0;
        const safeQtdPaxs = Number.isFinite(qtdPaxsNum) ? Math.max(qtdPaxsNum, 0) : 0;
        const safeValorApto = Number.isFinite(valorPorAptoNum) ? Math.max(valorPorAptoNum, 0) : 0;
        const effectiveValorApto = safeValorApto > 0 ? safeValorApto : Math.max(safeValorPessoa * safeQtdPaxs, 0);
        return {
          tipo,
          valor_pessoa: safeValorPessoa > 0 ? formatCurrency(safeValorPessoa) : "-",
          qte_paxs: safeQtdPaxs > 0 ? String(safeQtdPaxs) : "-",
          valor_apto: effectiveValorApto > 0 ? formatCurrency(effectiveValorApto) : "-",
          valor_apto_num: effectiveValorApto,
        } as const;
      })
      .filter((row) => Boolean(row.tipo || row.valor_pessoa !== "-" || row.qte_paxs !== "-" || row.valor_apto !== "-"));

    const drawInvestimentoHeader = () => {
      ensureSpace(24);
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(invHeaderFontSize);
      doc.setTextColor(...colors.muted);
      let colX = tableX;
      columns.forEach((column, index) => {
        if (centeredColumns.has(String(column.key))) {
          doc.text(column.label, colX + column.width / 2, curY + bodyFontSize + 1, { align: "center" });
        } else {
          doc.text(column.label, colX, curY + bodyFontSize + 1);
        }
        colX += column.width + (index < columns.length - 1 ? columnGap : 0);
      });
      doc.setDrawColor(209, 213, 219);
      doc.setLineWidth(0.45);
      const lineY = curY + bodyLineHeight + 5;
      let lineColX = tableX;
      columns.forEach((column, index) => {
        doc.line(lineColX, lineY, lineColX + column.width, lineY);
        lineColX += column.width + (index < columns.length - 1 ? columnGap : 0);
      });
      curY += bodyLineHeight + 10;
    };

    drawInvestimentoHeader();

    investimentoRows.forEach((row) => {
      const beforeEnsure = curY;
      ensureSpace(bodyLineHeight + 6);
      if (curY < beforeEnsure) {
        drawInvestimentoHeader();
      }

      doc.setFont(bodyFont, "normal");
      doc.setFontSize(invBodyFontSize);
      doc.setTextColor(...colors.muted);

      const rowLineCounts = columns.map((column) => {
        const value = String(row[column.key] || "") || "-";
        const lines = doc.splitTextToSize(value, Math.max(column.width - 2, 40));
        return lines.length || 1;
      });
      const rowLineCount = Math.max(...rowLineCounts, 1);
      const rowHeight = rowLineCount * bodyLineHeight;

      let colX = tableX;
      columns.forEach((column, index) => {
        const value = String(row[column.key] || "") || "-";
        const lines = doc.splitTextToSize(value, Math.max(column.width - 2, 40));
        lines.forEach((line: string, lineIndex: number) => {
          const y = curY + bodyFontSize + 1 + lineIndex * bodyLineHeight;
          if (centeredColumns.has(String(column.key))) {
            doc.text(String(line), colX + column.width / 2, y, { align: "center" });
          } else {
            doc.text(String(line), colX, y);
          }
        });
        colX += column.width + (index < columns.length - 1 ? columnGap : 0);
      });

      curY += rowHeight + 4;
    });

    const investimentoTotalTabela = investimentoRows.reduce((sum, row) => sum + Number(row.valor_apto_num || 0), 0);
    ensureSpace(bodyLineHeight + 10);
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.45);
    doc.line(tableX, curY + 2, tableX + tableWidth, curY + 2);
    curY += 10;
    doc.setFont(bodyFont, "bold");
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(...colors.text);
    doc.text("Total Geral (Aptos)", tableX, curY + bodyFontSize);
    const valorTotalAptoStartX =
      tableX +
      columns[0].width +
      columnGap +
      columns[1].width +
      columnGap +
      columns[2].width +
      columnGap;
    const valorTotalAptoCenterX = valorTotalAptoStartX + columns[3].width / 2;
    doc.text(formatCurrency(investimentoTotalTabela), valorTotalAptoCenterX, curY + bodyFontSize, { align: "center" });
    curY += bodyLineHeight + 2;
    closeCard({ addGapAfter: true });
  }

  // O que está incluído
  const incluiTexto = String(roteiro.inclui_texto || "").trim();
  const incluiItems = [
    ...parseLineItems(incluiTexto),
    ...extractSeguroViagemIncludeLinesFromPasseios(roteiro.passeios || []),
  ].filter(Boolean);
  const incluiSeen = new Set<string>();
  const incluiUnicos = incluiItems
    .map((item) => textValue(item))
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeLookup(item);
      if (!key || incluiSeen.has(key)) return false;
      incluiSeen.add(key);
      return true;
    });
  if (incluiUnicos.length > 0) {
    drawSectionTitle("O que está incluído:");
    drawBulletList(incluiUnicos.map((value) => ({ label: "", value })), activeCardIndent);
    closeCard({ addGapAfter: true });
  }

  // O que não está incluído
  const naoIncluiTexto = String(roteiro.nao_inclui_texto || "").trim();
  if (naoIncluiTexto) {
    drawSectionTitle("O que não está incluído:");
    const items = parseLineItems(naoIncluiTexto);
    if (items.length) drawBulletList(items.map((value) => ({ label: "", value })), activeCardIndent);
    else drawTextBlock(naoIncluiTexto, activeCardIndent);
    closeCard({ addGapAfter: true });
  }

  // Pagamento
  if (pagamentos.length > 0) {
    drawSectionTitle("Pagamento");

    const pagamentoGroups = groupPagamentosByFormaForPdf(pagamentos);
    pagamentoGroups.forEach((group, groupIndex) => {
      const hasServicos = group.servicos.length > 0;
      const hasFormas = group.formas.length > 0;
      if (!hasServicos && !hasFormas) return;
      const serviceTitle = hasServicos ? group.servicos.join(" / ") : "";
      const isAereoGroup = group.servicos.some((servico) => normalizeCompare(servico).startsWith("passagem aerea"));
      const hasPacoteCompleto = group.servicos.some((servico) => normalizeCompare(servico) === "pacote completo");
      let displaySubtotal = group.subtotal;
      let displayTaxesTotal = group.taxesTotal;
      let displayTotal = group.total;
      if (hasPacoteCompleto && displayTotal <= 0 && investimentoTotalApto > 0) {
        displaySubtotal = investimentoTotalApto;
        displayTaxesTotal = 0;
        displayTotal = investimentoTotalApto;
      }

      if (groupIndex > 0) {
        curY += 10;
      }

      if (serviceTitle) {
        const serviceMarkerSize = 9;
        const serviceMarkerGap = 8;
        const serviceX = margin + activeCardIndent;
        const serviceTextX = serviceX + serviceMarkerSize + serviceMarkerGap;
        ensureSpace(bodyLineHeight * 3);
        drawArrowRightMarker(serviceX, curY + 2, colors.text, serviceMarkerSize);
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(...colors.text);
        doc.text(serviceTitle, serviceTextX, curY + bodyFontSize);
        curY += bodyLineHeight * 2;
      }

      const valueBlockX = margin + activeCardIndent + 17;
      const resumoValores = isAereoGroup
        ? `Valor sem Taxas: ${formatCurrency(displaySubtotal)} | Valor das Taxas: ${formatCurrency(displayTaxesTotal)} | Valor Total: ${formatCurrency(displayTotal)}`
        : `Valor Total: ${formatCurrency(displayTotal)}`;
      const resumoMaxWidth = pageWidth - margin - valueBlockX;
      const resumoLines = doc.splitTextToSize(resumoValores, resumoMaxWidth);
      doc.setFont(bodyFont, "normal");
      doc.setFontSize(10);
      doc.setTextColor(...colors.muted);
      resumoLines.forEach((line: string) => {
        ensureSpace(bodyLineHeight);
        doc.text(line, valueBlockX, curY + bodyFontSize);
        curY += bodyLineHeight;
      });

      // Respiro visual entre a linha de valores e o bloco de forma de pagamento.
      curY += bodyLineHeight;

      if (hasFormas) {
        ensureSpace(bodyLineHeight);
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(...colors.text);
        doc.text("Forma de Pagamento:", margin + activeCardIndent, curY + bodyFontSize);
        curY += bodyLineHeight;
        drawBulletList(group.formas.map((f) => ({ label: "", value: f })), activeCardIndent);
      }
    });
    closeCard({ addGapAfter: true });
  }

  // Informações Importantes (por roteiro)
  const infoImportanteTexto = String(roteiro.informacoes_importantes || "").trim();
  if (infoImportanteTexto) {
    drawSectionTitle("Informações Importantes");
    const items = parseLineItems(infoImportanteTexto);
    if (items.length) {
      drawBulletList(items.map((value) => ({ label: "", value })), activeCardIndent);
    } else {
      drawTextBlock(infoImportanteTexto, activeCardIndent);
    }
    closeCard({ addGapAfter: true });
  }

  // Footer rodape (configuração do PDF)
  if (settings.rodape_texto) {
    curY += 16;
    doc.setDrawColor(...colors.border);
    doc.setLineWidth(0.5);
    doc.line(margin, curY, pageWidth - margin, curY);
    curY += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...colors.muted);
    const footerLines = doc.splitTextToSize(settings.rodape_texto, pageWidth - margin * 2);
    footerLines.forEach((line: string) => {
      ensureSpace(12);
      doc.text(line, margin, curY);
      curY += 11;
    });
  }

  const safeName = (roteiro.nome || "roteiro").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);

  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page);
    drawPageNumber(page, totalPages);
  }

  if (action === "blob-url" && typeof window !== "undefined") {
    const blob = doc.output("blob");
    return URL.createObjectURL(blob);
  }

  if (action === "preview" && typeof window !== "undefined") {
    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const win = window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (!win) {
      doc.save(`roteiro-${safeName}.pdf`);
    }
    return;
  }

  doc.save(`roteiro-${safeName}.pdf`);
}
