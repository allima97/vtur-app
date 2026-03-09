import { jsPDF } from "jspdf";
import { supabaseBrowser } from "../supabase-browser";
import { construirLinkWhatsApp } from "../whatsapp";
import { QuotePdfSettings } from "./quotePdf";

export type RoteiroParaPdf = {
  nome: string;
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
  data_inicio?: string;
  data_fim?: string;
  noites?: number;
  apto?: string;
  categoria?: string;
  regime?: string;
};

export type RoteiroPasseioPdf = {
  cidade?: string;
  passeio?: string;
  data_inicio?: string;
  data_fim?: string;
  tipo?: string;
  ingressos?: string;
};

export type RoteiroTransportePdf = {
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

export type ExportRoteiroPdfOptions = {
  action?: "download" | "preview";
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

function formatCurrency(value?: number | null) {
  if (!value || !Number.isFinite(value)) return "R$ 0,00";
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export async function exportRoteiroPdf(roteiro: RoteiroParaPdf, options: ExportRoteiroPdfOptions = {}) {
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

  const pagamentos = (roteiro.pagamentos || []).filter((p) => {
    const servico = String(p.servico || "").trim();
    const formas = parseLineItems(String(p.forma_pagamento || ""));
    const total = Number(p.valor_total_com_taxas || 0);
    const taxas = Number(p.taxas || 0);
    return Boolean(servico || formas.length > 0 || total > 0 || taxas > 0);
  });

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

    curY = lineY + 22;
    doc.setTextColor(...colors.text);
  }

  function drawSectionTitle(title: string) {
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

    doc.setFont(bodyFont, "bold");
    doc.setFontSize(16);
    doc.setTextColor(...colors.title);
    doc.text(cleanTitle, margin + cardPaddingX, curY + 16);
    curY += 30;

    const endY = curY + cardPaddingBottom;
    const h = Math.max(28, endY - startY);
    doc.setDrawColor(...cardBorder);
    doc.setLineWidth(0.8);
    doc.roundedRect(cardX, startY, cardW, h, cardRadius, cardRadius);
    curY = startY + h + cardGapAfter;

    // Card do conteúdo (separado, sem repetir título)
    openCard(cleanTitle, cardPaddingX, { showTitle: false });
  }

  function drawTextBlock(text: string, indent = 0) {
    const width = pageWidth - margin * 2 - indent;
    doc.setFont(bodyFont, "normal");
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(0, 0, 0);

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

  function drawBlankBox(height: number, indent = 0) {
    const width = pageWidth - margin * 2 - indent;
    ensureSpace(height + 12);
    // box interno (placeholder) — sem cara de "card"
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.6);
    doc.rect(margin + indent, curY + 6, width, height);
    curY += height + 16;
  }

  function drawCenteredTitle() {
    const title = "Roteiro Personalizado";
    const subtitle = String(roteiro.nome || "").trim();

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
    doc.setTextColor(0, 0, 0);
    const labelText = `${label}: `;
    doc.text(labelText, x, curY + bodyFontSize);
    const labelW = doc.getTextWidth(labelText);
    doc.setFont(bodyFont, "normal");
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

    items
      .filter((i) => Boolean(i.value))
      .forEach((item) => {
        const labelText = item.label ? `${item.label}: ` : "";
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(0, 0, 0);
        const labelW = labelText ? doc.getTextWidth(labelText) : 0;

        doc.setFont(bodyFont, "normal");
        const lines = doc.splitTextToSize(item.value, maxWidth - labelW);
        if (!lines.length) return;

        // first line
        ensureSpace(bodyLineHeight);
        doc.setFillColor(0, 0, 0);
        doc.circle(bulletX, curY + bodyFontSize - 4, bulletRadius, "F");
        if (labelText) {
          doc.setFont(bodyFont, "bold");
          doc.text(labelText, textX, curY + bodyFontSize);
        }
        doc.setFont(bodyFont, "normal");
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
        // ✓
        doc.line(x + 2, y + 6, x + 4.3, y + 8.5);
        doc.line(x + 4.3, y + 8.5, x + 8.5, y + 2.5);
      } else {
        // ✗
        doc.line(x + 2.2, y + 2.2, x + 8, y + 8);
        doc.line(x + 8, y + 2.2, x + 2.2, y + 8);
      }
    };

    doc.setFont(bodyFont, "normal");
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(0, 0, 0);

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
    const seen = new Set<string>();
    const cities: string[] = [];
    const add = (value?: string | null) => {
      const v = String(value || "").trim();
      if (!v) return;
      const key = v.toLocaleLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      cities.push(v);
    };

    (roteiro.dias || [])
      .slice()
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .forEach((d) => add(d.cidade));
    (roteiro.hoteis || []).forEach((h) => add(h.cidade));
    (roteiro.passeios || []).forEach((p) => add(p.cidade));
    add(roteiro.inicio_cidade || null);
    add(roteiro.fim_cidade || null);
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
  drawCenteredTitle();

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
      const place = percurso || cidade;
      const header = [dateLabel, `Dia ${idx + 1}${place ? `: ${place}` : ""}`].filter(Boolean).join(" — ");

      ensureSpace(bodyLineHeight + 6);
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(bodyFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(header || `Dia ${idx + 1}`, margin + activeCardIndent, curY + bodyFontSize);
      curY += bodyLineHeight;

      if (dia.descricao) {
        drawTextBlock(dia.descricao, activeCardIndent);
      }
      curY += 8;
    });
    closeCard({ addGapAfter: true });
  }

  // Hotéis Sugeridos
  const hoteis = (roteiro.hoteis || []).filter((h) => {
    return Boolean(
      String(h.cidade || "").trim() ||
        String(h.hotel || "").trim() ||
        String(h.data_inicio || "").trim() ||
        String(h.data_fim || "").trim() ||
        String(h.apto || "").trim() ||
        String(h.regime || "").trim() ||
        String(h.categoria || "").trim() ||
        Number.isFinite(Number(h.noites))
    );
  });
  if (hoteis.length > 0) {
    drawSectionTitle("Hotéis Sugeridos");
    hoteis.forEach((h) => {
      const cidade = (h.cidade || "").trim();
      const hotel = (h.hotel || "").trim();
      const heading = [cidade, hotel].filter(Boolean).join(" | ") || "Hotel";

      ensureSpace(bodyLineHeight);
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(bodyFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(heading, margin + activeCardIndent, curY + bodyFontSize);
      curY += bodyLineHeight;

      const di = toDateOrNull(h.data_inicio || null);
      const df = toDateOrNull(h.data_fim || null);
      const noites = Number.isFinite(Number(h.noites))
        ? Number(h.noites)
        : (di && df) ? Math.max(0, Math.round((df.getTime() - di.getTime()) / (24 * 60 * 60 * 1000))) : 0;
      const periodo = di && df
        ? `${formatDate(h.data_inicio)} a ${formatDate(h.data_fim)}${noites ? ` (${noites} noite${noites === 1 ? "" : "s"})` : ""}`
        : "";

      drawBulletList([
        { label: "Período", value: periodo },
        { label: "Acomodação", value: h.apto || "" },
        { label: "Regime", value: h.regime || "" },
        { label: "Categoria", value: h.categoria || "" },
      ], activeCardIndent);
      curY += 10;
    });
    closeCard({ addGapAfter: true });
  }

  // Principais Passeios
  const passeios = (roteiro.passeios || []).filter((p) => {
    return Boolean(
      String(p.cidade || "").trim() ||
        String(p.passeio || "").trim() ||
        String(p.data_inicio || "").trim() ||
        String(p.data_fim || "").trim() ||
        String(p.tipo || "").trim() ||
        String(p.ingressos || "").trim()
    );
  });
  if (passeios.length > 0) {
    drawSectionTitle("Principais Passeios");
    passeios.forEach((p) => {
      const cidade = (p.cidade || "").trim();
      const passeio = (p.passeio || "").trim();
      const heading = [cidade, passeio].filter(Boolean).join(" | ") || "Passeio";

      ensureSpace(bodyLineHeight);
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(bodyFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(heading, margin + activeCardIndent, curY + bodyFontSize);
      curY += bodyLineHeight;

      const di = toDateOrNull(p.data_inicio || null);
      const df = toDateOrNull(p.data_fim || null);
      const data = di && df
        ? (formatDate(p.data_inicio) === formatDate(p.data_fim) ? formatDate(p.data_inicio) : `${formatDate(p.data_inicio)} a ${formatDate(p.data_fim)}`)
        : formatDate(p.data_inicio) || formatDate(p.data_fim);

      drawBulletList([
        { label: "Data", value: data || "" },
        { label: "Tipo", value: p.tipo || "" },
        { label: "Ingressos", value: p.ingressos || "" },
      ], activeCardIndent);
      curY += 10;
    });
    closeCard({ addGapAfter: true });
  }

  // Transporte Incluído
  const transportes = (roteiro.transportes || []).filter((t) => {
    return Boolean(
      String(t.tipo || "").trim() ||
        String(t.fornecedor || "").trim() ||
        String(t.descricao || "").trim() ||
        String(t.data_inicio || "").trim() ||
        String(t.data_fim || "").trim() ||
        String(t.categoria || "").trim() ||
        String(t.observacao || "").trim()
    );
  });
  if (transportes.length > 0) {
    drawSectionTitle("Transporte Incluído");
    transportes.forEach((t) => {
      const tipo = (t.tipo || "").trim();
      const fornecedor = (t.fornecedor || "").trim();
      const heading = [tipo || "Transporte", fornecedor].filter(Boolean).join(" | ");

      ensureSpace(bodyLineHeight);
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(bodyFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text(heading, margin + activeCardIndent, curY + bodyFontSize);
      curY += bodyLineHeight;

      const di = toDateOrNull(t.data_inicio || null);
      const df = toDateOrNull(t.data_fim || null);
      const periodo = di && df
        ? (formatDate(t.data_inicio) === formatDate(t.data_fim) ? formatDate(t.data_inicio) : `${formatDate(t.data_inicio)} a ${formatDate(t.data_fim)}`)
        : formatDate(t.data_inicio) || formatDate(t.data_fim);

      drawBulletList([
        { label: "Período", value: periodo || "" },
        { label: "Descrição", value: t.descricao || "" },
        { label: "Categoria", value: t.categoria || "" },
        { label: "Observação", value: t.observacao || "" },
      ], activeCardIndent);
      curY += 10;
    });
    closeCard({ addGapAfter: true });
  }

  // Investimento
  const investimentos = (roteiro.investimentos || []).filter((i) => {
    const vpp = Number(i.valor_por_pessoa || 0);
    const qtd = Number(i.qtd_apto || 0);
    const vpa = Number(i.valor_por_apto || 0);
    return Boolean(vpp > 0 || qtd > 0 || vpa > 0);
  });
  if (investimentos.length > 0) {
    drawSectionTitle("Investimento");
    investimentos.forEach((i) => {
      const tipo = (i.tipo || "").trim();
      const bulletItems = [
        { label: "Valor por Pessoa", value: Number(i.valor_por_pessoa || 0) > 0 ? formatCurrency(Number(i.valor_por_pessoa)) : "" },
        { label: "Qte Pax", value: Number(i.qtd_apto || 0) > 0 ? String(i.qtd_apto) : "" },
        { label: "Valor por Apto", value: Number(i.valor_por_apto || 0) > 0 ? formatCurrency(Number(i.valor_por_apto)) : "" },
      ];
      const hasBulletContent = bulletItems.some((b) => Boolean(b.value));

      if (!tipo && !hasBulletContent) return;
      if (tipo) {
        ensureSpace(bodyLineHeight);
        doc.setFont(bodyFont, "bold");
        doc.setFontSize(bodyFontSize);
        doc.setTextColor(0, 0, 0);
        doc.text(tipo, margin + activeCardIndent, curY + bodyFontSize);
        curY += bodyLineHeight;
      }

      if (hasBulletContent) {
        drawBulletList(bulletItems, activeCardIndent);
      }
      curY += 10;
    });
    closeCard({ addGapAfter: true });
  }

  // O que ESTÁ incluído
  const incluiTexto = String(roteiro.inclui_texto || "").trim();
  if (incluiTexto) {
    drawSectionTitle("O que ESTÁ incluído:");
    const items = parseLineItems(incluiTexto);
    if (items.length) drawBulletList(items.map((value) => ({ label: "", value })), activeCardIndent);
    else drawTextBlock(incluiTexto, activeCardIndent);
    closeCard({ addGapAfter: true });
  }

  // O que NÃO está incluído
  const naoIncluiTexto = String(roteiro.nao_inclui_texto || "").trim();
  if (naoIncluiTexto) {
    drawSectionTitle("O que NÃO está incluído:");
    const items = parseLineItems(naoIncluiTexto);
    if (items.length) drawBulletList(items.map((value) => ({ label: "", value })), activeCardIndent);
    else drawTextBlock(naoIncluiTexto, activeCardIndent);
    closeCard({ addGapAfter: true });
  }

  // Pagamento
  if (pagamentos.length > 0) {
    drawSectionTitle("Pagamento");
    const subtotal = pagamentos.reduce(
      (sum: number, p: any) => sum + Math.max(Number(p.valor_total_com_taxas || 0) - Number(p.taxas || 0), 0),
      0
    );
    const taxesTotal = pagamentos.reduce((sum: number, p: any) => sum + Math.max(Number(p.taxas || 0), 0), 0);
    const total = pagamentos.reduce((sum: number, p: any) => sum + Math.max(Number(p.valor_total_com_taxas || 0), 0), 0);

    const kvX = margin + activeCardIndent;
    drawKeyValueLine("Valor do Pacote", formatCurrency(subtotal), kvX);
    drawKeyValueLine("Taxas", formatCurrency(taxesTotal), kvX);
    drawKeyValueLine("Total Geral", formatCurrency(total), kvX);
    curY += 6;

    const formas = Array.from(
      new Set(
        pagamentos
          .flatMap((p) => parseLineItems(String(p.forma_pagamento || "")))
          .map((v) => String(v || "").trim())
          .filter(Boolean)
      )
    );
    if (formas.length) {
      ensureSpace(bodyLineHeight);
      doc.setFont(bodyFont, "bold");
      doc.setFontSize(bodyFontSize);
      doc.setTextColor(0, 0, 0);
      doc.text("Forma de Pagamento:", margin + activeCardIndent, curY + bodyFontSize);
      curY += bodyLineHeight;
      drawBulletList(formas.map((f) => ({ label: "", value: f })), activeCardIndent);
    }
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
