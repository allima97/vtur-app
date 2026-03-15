import { createServerClient } from "../../../../lib/supabaseServer";
import { resolveThemeAssetMeta } from "../../../../lib/cards/officialLibrary";
import { buildCardFontFaceCss } from "../../../../lib/cards/cardFonts";
import { getCardThemeLayout, type CardThemeMask, type CardThemePhotoSlot } from "../../../../lib/cards/themeLayouts";
import { parseCardStyleOverrideParam, resolveCardStyleMap } from "../../../../lib/cards/styleConfig";
import { renderTemplateText } from "../../../../lib/messageTemplates";
import { getSupabaseEnv } from "../../users";

export type CardStyle = {
  x?: number;
  y?: number;
  maxWidth?: number;
  width?: number;
  fontSize?: number;
  fontWeight?: number | string;
  color?: string;
  fontFamily?: string;
  align?: "left" | "center" | "right" | "justify";
  textAlign?: "left" | "center" | "right" | "justify";
  lineHeight?: number;
  italic?: boolean;
  fontStyle?: "normal" | "italic";
};

export type CardRenderResult = {
  svg: string;
  width: number;
  height: number;
};

const MASTER_WIDTH = 1080;
const MASTER_HEIGHT = 1080;
const MASTER_LAYOUT_KEY = "master-card-v1";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseCookies(request: Request): Map<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const map = new Map<string, string>();
  header.split(";").forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const [rawName, ...rawValue] = trimmed.split("=");
    const name = rawName?.trim();
    if (!name) return;
    map.set(name, rawValue.join("=").trim());
  });
  return map;
}

function buildAuthClient(request: Request) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(request);
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY não configurados.");
  }
  const cookies = parseCookies(request);
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (name: string) => cookies.get(name) ?? "",
      set: () => {},
      remove: () => {},
    },
  });
}

function parseNum(v: string | null | undefined, fallback: number) {
  if (v == null) return fallback;
  const raw = String(v).trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function splitParagraph(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapText(text: string, style: CardStyle) {
  const safeText = String(text || "").replace(/\r/g, "").trim();
  if (!safeText) return [];
  const fontSize = Number(style.fontSize || 52);
  const maxWidth = Number(style.maxWidth || style.width || 860);
  const maxChars = Math.max(8, Math.floor(maxWidth / Math.max(fontSize * 0.55, 8)));

  // Se o usuário definiu as quebras manualmente com Enter, respeita a linha digitada.
  if (safeText.includes("\n")) {
    return safeText.split("\n").map((line) => line.trim());
  }

  const paragraphs = safeText.split(/\n+/);
  const lines: string[] = [];
  paragraphs.forEach((p, idx) => {
    const wrapped = splitParagraph(p, maxChars);
    wrapped.forEach((line) => lines.push(line));
    if (idx < paragraphs.length - 1) lines.push("");
  });
  return lines;
}

function estimateWordWidth(word: string, fontSize: number) {
  const normalized = String(word || "").trim();
  if (!normalized) return Math.max(1, fontSize * 0.28);
  return Math.max(fontSize * 0.3, normalized.length * fontSize * 0.56);
}

function resolveAlign(value?: string | null): "left" | "center" | "right" | "justify" {
  const align = String(value || "").trim().toLowerCase();
  if (align === "left" || align === "center" || align === "right" || align === "justify") return align;
  return "center";
}

function drawTextBlock(text: string, style: CardStyle) {
  const lines = wrapText(text, style);
  if (!lines.length) return "";
  const x = Number(style.x || 540);
  const y = Number(style.y || 760);
  const maxWidth = Number(style.maxWidth || style.width || 860);
  const fontSize = Number(style.fontSize || 52);
  const fontWeight = String(style.fontWeight || "500");
  const color = escapeXml(String(style.color || "#0A0A0A"));
  const fontFamily = escapeXml(String(style.fontFamily || "Alegreya Sans, Arial, sans-serif"));
  const align = resolveAlign(style.align || style.textAlign || "center");
  const lineHeight = Number(style.lineHeight || 1.2);
  const italic = style.italic || style.fontStyle === "italic" ? "italic" : "normal";
  const step = Math.round(fontSize * lineHeight);
  const textAttrs = `font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}" fill="${color}" font-style="${italic}"`;

  if (align !== "justify") {
    const anchor = align === "center" ? "middle" : align === "right" ? "end" : "start";
    const tspans = lines
      .map((line, idx) => `<tspan x="${x}" dy="${idx === 0 ? 0 : step}">${escapeXml(line || " ")}</tspan>`)
      .join("");
    return `<text x="${x}" y="${y}" text-anchor="${anchor}" ${textAttrs}>${tspans}</text>`;
  }

  const lastNonEmptyLineIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (String(lines[i] || "").trim()) return i;
    }
    return -1;
  })();

  const justifiedLines = lines
    .map((line, idx) => {
      const trimmedLine = String(line || "").trim();
      if (!trimmedLine) return "";
      const lineY = y + idx * step;
      const isLastLine = idx >= lastNonEmptyLineIdx;
      const words = trimmedLine.split(/\s+/).filter(Boolean);

      if (isLastLine || words.length < 2) {
        return `<text x="${x}" y="${lineY}" text-anchor="start" ${textAttrs}>${escapeXml(trimmedLine)}</text>`;
      }

      const totalWordWidth = words.reduce((acc, word) => acc + estimateWordWidth(word, fontSize), 0);
      const gapCount = words.length - 1;
      const calculatedGap = (maxWidth - totalWordWidth) / gapCount;
      const minGap = fontSize * 0.14;

      if (!Number.isFinite(calculatedGap) || calculatedGap < minGap) {
        return `<text x="${x}" y="${lineY}" text-anchor="start" ${textAttrs}>${escapeXml(trimmedLine)}</text>`;
      }

      let cursorX = x;
      return words
        .map((word, wordIndex) => {
          const node = `<text x="${cursorX.toFixed(2)}" y="${lineY}" text-anchor="start" ${textAttrs}>${escapeXml(word)}</text>`;
          cursorX += estimateWordWidth(word, fontSize);
          if (wordIndex < words.length - 1) cursorX += calculatedGap;
          return node;
        })
        .join("");
    })
    .join("");

  return justifiedLines;
}

function drawPhotoBlock(photoUrl: string, slot: CardThemePhotoSlot) {
  const x = Number(slot.x || 0);
  const y = Number(slot.y || 0);
  const width = Number(slot.width || 0);
  const height = Number(slot.height || 0);
  if (!photoUrl || width <= 0 || height <= 0) return "";

  const framePadding = Math.max(0, Number(slot.framePadding || 0));
  const frameRadius = Math.max(0, Number(slot.frameRadius || 0));
  const rotation = Number(slot.rotation || 0);
  const frameFill = escapeXml(String(slot.frameFill || "#FFFFFF"));
  const shadowColor = escapeXml(String(slot.shadowColor || "rgba(0,0,0,0.18)"));
  const shadowBlur = Math.max(0, Number(slot.shadowBlur || 12));
  const shadowDx = Number(slot.shadowDx || 0);
  const shadowDy = Number(slot.shadowDy || 8);
  const outerX = x - framePadding;
  const outerY = y - framePadding;
  const outerWidth = width + framePadding * 2;
  const outerHeight = height + framePadding * 2;
  const centerX = outerX + outerWidth / 2;
  const centerY = outerY + outerHeight / 2;
  const innerRadius = Math.max(0, frameRadius - Math.min(framePadding, frameRadius));
  const transform = rotation ? ` transform="rotate(${rotation} ${centerX} ${centerY})"` : "";

  return `
  <defs>
    <filter id="cardPhotoShadow" x="${outerX - 60}" y="${outerY - 60}" width="${outerWidth + 120}" height="${outerHeight + 120}" filterUnits="userSpaceOnUse">
      <feDropShadow dx="${shadowDx}" dy="${shadowDy}" stdDeviation="${shadowBlur}" flood-color="${shadowColor}" />
    </filter>
    <clipPath id="cardPhotoClip">
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${innerRadius}" />
    </clipPath>
  </defs>
  <g${transform}>
    <rect x="${outerX}" y="${outerY}" width="${outerWidth}" height="${outerHeight}" rx="${frameRadius}" fill="${frameFill}" filter="url(#cardPhotoShadow)" />
    <image href="${escapeXml(photoUrl)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cardPhotoClip)" />
  </g>`;
}

function drawMaskBlock(mask: CardThemeMask, id: string) {
  const x = Number(mask.x || 0);
  const y = Number(mask.y || 0);
  const width = Number(mask.width || 0);
  const height = Number(mask.height || 0);
  if (width <= 0 || height <= 0) return "";

  const radius = Math.max(0, Number(mask.radius || 0));
  const fill = escapeXml(String(mask.fill || "#FFFFFF"));
  const opacity = Math.min(1, Math.max(0, Number(mask.opacity ?? 1)));
  const blur = Math.max(0, Number(mask.blur || 0));

  if (blur > 0) {
    return `
  <defs>
    <filter id="${id}" x="${x - blur * 4}" y="${y - blur * 4}" width="${width + blur * 8}" height="${height + blur * 8}" filterUnits="userSpaceOnUse">
      <feGaussianBlur stdDeviation="${blur}" />
    </filter>
  </defs>
  <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" opacity="${opacity}" filter="url(#${id})" />`;
  }

  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" opacity="${opacity}" />`;
}

function normalizeColor(value: unknown, fallback: string) {
  const color = String(value || "").trim();
  if (!color) return fallback;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color)) return color;
  return fallback;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractSignatureTextConfig(signatureStyle?: unknown) {
  const content = isRecord(signatureStyle) && isRecord(signatureStyle.content)
    ? signatureStyle.content
    : null;
  const hasFooterLead =
    !!content && Object.prototype.hasOwnProperty.call(content, "footerLead");
  const hasConsultantRole =
    !!content && Object.prototype.hasOwnProperty.call(content, "consultantRole");

  return {
    footerLead: String(content?.footerLead || "").trim(),
    consultantRole: String(content?.consultantRole || "").trim(),
    hasFooterLead,
    hasConsultantRole,
  };
}

function fixedMasterStyle(params: {
  base: CardStyle;
  queryFontSize?: string | null;
  queryColor?: string | null;
  queryItalic?: boolean | null;
}) {
  const { base, queryFontSize, queryColor, queryItalic } = params;
  const fontSize = parseNum(queryFontSize, Number(base.fontSize || 48));
  const lineHeightRaw = Number(base.lineHeight || 1.2);
  const lineHeight = Number.isFinite(lineHeightRaw) && lineHeightRaw > 0 ? lineHeightRaw : Number(base.lineHeight || 1.2);
  const fontFamily = String(base.fontFamily || "Alegreya Sans, Arial, sans-serif");
  const fontWeight = String(base.fontWeight || "500");
  const italicRaw = base.italic === true || base.fontStyle === "italic";
  const italic = queryItalic === null || queryItalic === undefined ? italicRaw : queryItalic;
  const color = normalizeColor(queryColor || base.color, String(base.color || "#0A0A0A"));

  return {
    x: base.x,
    y: base.y,
    maxWidth: base.maxWidth,
    width: base.width,
    align: base.align || base.textAlign,
    fontSize,
    lineHeight,
    fontFamily,
    fontWeight,
    color,
    italic,
  } as CardStyle;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isVisible(flag: boolean | undefined, fallback = true) {
  return flag === undefined ? fallback : flag;
}

function absoluteAssetUrl(origin: string, assetUrl: string) {
  const raw = String(assetUrl || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  if (raw.startsWith("/")) return `${origin}${raw}`;
  return `${origin}/${raw.replace(/^\.?\//, "")}`;
}

export async function renderCardSvg(request: Request): Promise<CardRenderResult> {
  const url = new URL(request.url);
  const client = buildAuthClient(request);

  const nome = String(url.searchParams.get("nome") || "Cliente").trim() || "Cliente";
  const clienteNomeLiteralRaw = String(url.searchParams.get("cliente_nome_literal") || "").trim();
  const tituloRaw = String(url.searchParams.get("titulo") || "").trim();
  const corpoRaw = String(url.searchParams.get("corpo") || "").trim();
  const hasFooterLeadParam = url.searchParams.has("footer_lead");
  const footerLeadRaw = String(url.searchParams.get("footer_lead") || "").trim();
  const assinaturaRaw = String(url.searchParams.get("assinatura") || "").trim();
  const consultorRaw = String(url.searchParams.get("consultor") || "").trim();
  const cargoConsultorRaw = String(url.searchParams.get("cargo_consultor") || "").trim();
  const empresaRaw = String(url.searchParams.get("empresa") || "").trim();
  const origemRaw = String(url.searchParams.get("origem") || "").trim();
  const destinoRaw = String(url.searchParams.get("destino") || "").trim();
  const dataViagemRaw = String(url.searchParams.get("data_viagem") || "").trim();
  const dataEmbarqueRaw = String(url.searchParams.get("data_embarque") || "").trim();
  const dataRetornoRaw = String(url.searchParams.get("data_retorno") || "").trim();
  const ctaRaw = String(url.searchParams.get("cta") || "").trim();
  const mensagemRaw = String(url.searchParams.get("mensagem") || "").trim();
  const photoUrlRaw = String(url.searchParams.get("photo_url") || url.searchParams.get("photo") || "").trim();
  const templateId = String(url.searchParams.get("template_id") || "").trim();
  let themeId = String(url.searchParams.get("theme_id") || "").trim();
  const themeName = String(url.searchParams.get("theme_name") || url.searchParams.get("theme_key") || "").trim();
  const themeAssetUrlFromQuery = String(url.searchParams.get("theme_asset_url") || "").trim();

  let templateRow: Record<string, any> | null = null;
  if (templateId) {
    const tplResp = await client
      .from("user_message_templates")
      .select("id, titulo, corpo, assinatura, theme_id, title_style, body_style, signature_style")
      .eq("id", templateId)
      .maybeSingle();
    if (!tplResp.error && tplResp.data) {
      templateRow = tplResp.data;
      if (!themeId && templateRow.theme_id) themeId = String(templateRow.theme_id);
    }
  }

  let themeRow: Record<string, any> | null = null;
  if (themeId || themeName) {
    let themeQuery = client
      .from("user_message_template_themes")
      .select("id, nome, asset_url, width_px, height_px, title_style, body_style, signature_style");
    if (themeId) themeQuery = themeQuery.eq("id", themeId);
    else themeQuery = themeQuery.eq("nome", themeName);
    const themeResp = await themeQuery.maybeSingle();
    if (!themeResp.error && themeResp.data) themeRow = themeResp.data;
    if (!themeId && themeRow?.id) themeId = String(themeRow.id);
  }

  const activeThemeName = themeName || String(themeRow?.nome || "").trim();
  const resolvedThemeAsset = resolveThemeAssetMeta(themeRow ? {
    nome: themeRow.nome,
    asset_url: themeRow.asset_url,
    width_px: themeRow.width_px,
    height_px: themeRow.height_px,
  } : { nome: activeThemeName });
  const themeLayout = getCardThemeLayout(activeThemeName);
  const width = parseNum(
    url.searchParams.get("width"),
    Number(themeLayout?.canvas?.width || resolvedThemeAsset.width_px || MASTER_WIDTH),
  );
  const height = parseNum(
    url.searchParams.get("height"),
    Number(themeLayout?.canvas?.height || resolvedThemeAsset.height_px || MASTER_HEIGHT),
  );
  const styleOverrideMap = parseCardStyleOverrideParam(url.searchParams.get("style_overrides"));
  const resolvedStyleMap = resolveCardStyleMap({
    themeName: activeThemeName,
    themeBuckets: themeRow ? {
      title_style: themeRow.title_style,
      body_style: themeRow.body_style,
      signature_style: themeRow.signature_style,
    } : null,
    templateBuckets: templateRow ? {
      title_style: templateRow.title_style,
      body_style: templateRow.body_style,
      signature_style: templateRow.signature_style,
    } : null,
    overrideMap: styleOverrideMap,
  });

  const titleStyle = fixedMasterStyle({
    base: resolvedStyleMap.title,
    queryFontSize: url.searchParams.get("title_font_size"),
    queryColor: url.searchParams.get("title_color"),
  });

  const clientNameStyle = fixedMasterStyle({
    base: resolvedStyleMap.clientName,
    queryFontSize: url.searchParams.get("client_name_font_size"),
    queryColor: url.searchParams.get("client_name_color"),
  });

  const bodyStyle = fixedMasterStyle({
    base: resolvedStyleMap.body,
    queryFontSize: url.searchParams.get("body_font_size"),
    queryColor: url.searchParams.get("body_color"),
  });

  const footerLeadStyle = fixedMasterStyle({
    base: resolvedStyleMap.footerLead,
    queryColor: url.searchParams.get("signature_color"),
    queryItalic: null,
  });

  const consultantStyle = fixedMasterStyle({
    base: resolvedStyleMap.consultant,
    queryFontSize: url.searchParams.get("signature_font_size"),
    queryColor: url.searchParams.get("signature_color"),
    queryItalic: url.searchParams.has("signature_italic") ? url.searchParams.get("signature_italic") === "1" : null,
  });

  const consultantRoleStyle = fixedMasterStyle({
    base: resolvedStyleMap.consultantRole,
    queryColor: url.searchParams.get("signature_color"),
  });

  const titulo = tituloRaw || templateRow?.titulo || `${nome}, feliz aniversário!`;
  const corpo =
    corpoRaw ||
    templateRow?.corpo ||
    "Que seu novo ano seja cheio de viagens, conquistas e momentos inesquecíveis.";
  const signatureTheme = extractSignatureTextConfig(themeRow?.signature_style);
  const signatureTemplate = extractSignatureTextConfig(templateRow?.signature_style);
  const hasFooterLeadConfig = signatureTemplate.hasFooterLead || signatureTheme.hasFooterLead;
  const hasConsultantRoleConfig = signatureTemplate.hasConsultantRole || signatureTheme.hasConsultantRole;
  const footerLeadConfig = signatureTemplate.hasFooterLead ? signatureTemplate.footerLead : signatureTheme.footerLead;
  const consultantRoleConfig = signatureTemplate.hasConsultantRole
    ? signatureTemplate.consultantRole
    : signatureTheme.consultantRole;
  const assinatura = assinaturaRaw || templateRow?.assinatura || consultorRaw || "";
  const consultor = consultorRaw || assinatura || "Equipe vtur";
  const footerLead = hasFooterLeadParam
    ? footerLeadRaw
    : hasFooterLeadConfig
      ? footerLeadConfig
      : "Com carinho";
  const cargoConsultor = cargoConsultorRaw || (hasConsultantRoleConfig ? consultantRoleConfig : "Consultor de viagens");

  const renderVars = {
    nomeCompleto: nome,
    assinatura: consultor,
    consultor,
    cargoConsultor,
    empresa: empresaRaw,
    origem: origemRaw,
    destino: destinoRaw,
    dataViagem: dataViagemRaw,
    dataEmbarque: dataEmbarqueRaw,
    dataRetorno: dataRetornoRaw,
    cta: ctaRaw,
    mensagem: mensagemRaw,
  };

  const forceNomeCompleto = Boolean(clienteNomeLiteralRaw);
  const titleText = renderTemplateText(titulo, renderVars, {
    useFullNameAsFirstName: forceNomeCompleto,
  });
  const clientNameText = clienteNomeLiteralRaw
    ? clienteNomeLiteralRaw
    : renderTemplateText(String(url.searchParams.get("cliente_nome") || "[PRIMEIRO_NOME],"), renderVars, {
        useFullNameAsFirstName: forceNomeCompleto,
      });
  const bodyTextRaw = renderTemplateText(corpo, {
    ...renderVars,
    mensagem: mensagemRaw || corpo,
  }, {
    useFullNameAsFirstName: forceNomeCompleto,
  });
  const bodyTextNoFooter = bodyTextRaw
    .replace(/\n+\s*com carinho\s*$/i, "")
    .replace(/\n+\s*consultor(?:a)? de viagens\s*$/i, "")
    .replace(new RegExp(`\\n+\\s*${escapeRegex(consultor)}\\s*$`, "i"), "")
    .trim();
  const bodyText = bodyTextNoFooter || bodyTextRaw;
  const footerLeadText = renderTemplateText(footerLead, renderVars, {
    useFullNameAsFirstName: forceNomeCompleto,
  });
  const consultantNameText = renderTemplateText("[CONSULTOR]", renderVars);
  const consultantRoleText = renderTemplateText("[CARGO_CONSULTOR]", renderVars);
  const showPhoto = Boolean(photoUrlRaw && themeLayout?.photo);
  const hideClientName = Boolean(showPhoto && themeLayout?.photo?.hideClientNameWhenPhoto);
  const hideBody = Boolean(showPhoto && themeLayout?.photo?.hideBodyWhenPhoto);
  const visibility = themeLayout?.visibility;

  const backgroundUrl = absoluteAssetUrl(
    url.origin,
    themeAssetUrlFromQuery || resolvedThemeAsset.asset_url,
  );

  const fontFaceCss = buildCardFontFaceCss();
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <metadata>${MASTER_LAYOUT_KEY}</metadata>
  <style><![CDATA[
${fontFaceCss}
  ]]></style>
  <rect width="${width}" height="${height}" fill="#F5F8FC" />
  ${backgroundUrl ? `<image href="${escapeXml(backgroundUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />` : ""}
  ${showPhoto ? drawPhotoBlock(photoUrlRaw, themeLayout?.photo as CardThemePhotoSlot) : ""}
  ${themeLayout?.clientNameMask ? drawMaskBlock(themeLayout.clientNameMask, `clientNameMask-${activeThemeName || "default"}`) : ""}
  ${isVisible(visibility?.title) ? drawTextBlock(titleText, titleStyle) : ""}
  ${hideClientName || !isVisible(visibility?.clientName) ? "" : drawTextBlock(clientNameText, clientNameStyle)}
  ${hideBody || !isVisible(visibility?.body) ? "" : drawTextBlock(bodyText, bodyStyle)}
  ${isVisible(visibility?.footerLead) ? drawTextBlock(footerLeadText, footerLeadStyle) : ""}
  ${isVisible(visibility?.consultant) ? drawTextBlock(consultantNameText, consultantStyle) : ""}
  ${isVisible(visibility?.consultantRole) ? drawTextBlock(consultantRoleText, consultantRoleStyle) : ""}
</svg>`;

  return { svg, width, height };
}
