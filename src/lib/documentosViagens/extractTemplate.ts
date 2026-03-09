export type DocumentTemplateField = {
  key: string;
  label: string;
  type: "text" | "date" | "signature";
};

export type ExtractedTemplate = {
  title: string;
  template_text: string;
  template_fields: DocumentTemplateField[];
};

function fileExt(name: string) {
  const base = String(name || "").trim();
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : "";
}

function deriveTitle(fileName: string, rawText: string) {
  const cleaned = String(fileName || "").replace(/\.[^.]+$/, "").trim();
  if (cleaned) return cleaned.slice(0, 120);
  const firstLine = String(rawText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length >= 6);
  return (firstLine || "Documento").slice(0, 120);
}

function normalizeNewlines(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/[ ]{2,}/g, " ");
}

function ensureFieldsAndAnchors(params: {
  templateText: string;
  fields: DocumentTemplateField[];
}) {
  let templateText = params.templateText;
  const fields = [...params.fields];

  const hasDateToken = /\{\{data\}\}/.test(templateText);
  if (!hasDateToken) {
    fields.push({ key: "data", label: "Data", type: "date" });
    // Não força inserir em local específico: adiciona bloco simples no final.
    templateText = `${templateText}\n\nData: {{data}}`;
  } else if (!fields.some((f) => f.key === "data")) {
    fields.push({ key: "data", label: "Data", type: "date" });
  }

  const hasSigToken = /\{\{assinatura_1\}\}/.test(templateText);
  if (!hasSigToken) {
    fields.push({ key: "assinatura_1", label: "Assinatura 1", type: "signature" });
    templateText = `${templateText}\n\n_________________________________\n{{assinatura_1}}`;
  } else if (!fields.some((f) => f.key === "assinatura_1")) {
    fields.push({ key: "assinatura_1", label: "Assinatura 1", type: "signature" });
  }

  const deduped: DocumentTemplateField[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    if (!f.key || seen.has(f.key)) continue;
    seen.add(f.key);
    deduped.push(f);
  }

  return { templateText, fields: deduped.slice(0, 80) };
}

function applyBlankTokens(rawText: string) {
  const fields: DocumentTemplateField[] = [];

  let textFieldIdx = 1;
  let sigIdx = 1;

  const lines = normalizeNewlines(rawText)
    .split("\n")
    .map((l) => l.replace(/[ ]+$/g, ""));

  const outLines = lines.map((line) => {
    const trimmed = line.trim();

    // Linha de assinatura (apenas underscores)
    if (/^_{10,}$/.test(trimmed)) {
      const key = `assinatura_${sigIdx}`;
      fields.push({ key, label: `Assinatura ${sigIdx}`, type: "signature" });
      sigIdx += 1;
      return `{{${key}}}`;
    }

    // Blanks comuns em modelos (sequência longa de underscores)
    const replaced = line.replace(/_{5,}/g, () => {
      const key = `campo_${textFieldIdx}`;
      fields.push({ key, label: `Campo ${textFieldIdx}`, type: "text" });
      textFieldIdx += 1;
      return `{{${key}}}`;
    });

    return replaced;
  });

  let templateText = outLines.join("\n");

  // Data: detecta placeholders comuns
  if (/00\/00\/0000|__\/__\/____|____-__-__/.test(templateText) && !/\{\{data\}\}/.test(templateText)) {
    fields.push({ key: "data", label: "Data", type: "date" });
    templateText = templateText
      .replace(/00\/00\/0000/g, "{{data}}")
      .replace(/__\/__\/____/g, "{{data}}")
      .replace(/____-__-__/g, "{{data}}")
      .replace(/____\/____\/____/g, "{{data}}");
  }

  return { templateText, fields };
}

function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const parts: string[] = [];

  function pushBlock(text: string) {
    const t = String(text || "").replace(/\s+$/g, "");
    if (t) parts.push(t);
  }

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node as Text).data;
      if (t) parts.push(t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;

    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      parts.push("\n");
      return;
    }

    const blockTags = new Set(["p", "div", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "li", "tr"]);
    const isBlock = blockTags.has(tag);
    if (isBlock) parts.push("\n");

    for (const child of Array.from(el.childNodes)) walk(child);

    if (isBlock) parts.push("\n");
  };

  walk(doc.body);

  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

async function extractDocxText(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return htmlToText(result?.value || "");
}

async function extractOdtText(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentFile = zip.file("content.xml");
  if (!contentFile) throw new Error("Arquivo ODT inválido (content.xml não encontrado).");
  const xml = await contentFile.async("string");
  const doc = new DOMParser().parseFromString(xml, "text/xml");

  const blocks: string[] = [];
  const all = Array.from(doc.getElementsByTagName("*"));
  for (const el of all) {
    const local = (el as any)?.localName ? String((el as any).localName) : "";
    if (local !== "p" && local !== "h") continue;
    const t = String((el as Element).textContent || "").trim();
    if (!t) continue;
    blocks.push(t);
    blocks.push("");
  }

  return blocks.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function extractXlsText(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const XLSX = await import("xlsx");
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) return "";
  const ws = wb.Sheets[sheetName];
  const csv = XLSX.utils.sheet_to_csv(ws, { FS: "\t" });
  return String(csv || "").trim();
}

export async function extractTemplateFromFile(file: File): Promise<ExtractedTemplate> {
  if (!file) throw new Error("Arquivo obrigatório.");

  const ext = fileExt(file.name);

  let rawText = "";
  if (ext === "pdf") {
    const { extractPdfText } = await import("../vendas/contratoCvcExtractor");
    rawText = await extractPdfText(file, { maxPages: 10 });
  } else if (ext === "docx") {
    rawText = await extractDocxText(file);
  } else if (ext === "odt") {
    rawText = await extractOdtText(file);
  } else if (ext === "xls" || ext === "xlsx") {
    rawText = await extractXlsText(file);
  } else if (ext === "txt") {
    rawText = normalizeNewlines(await file.text());
  } else {
    throw new Error("Formato não suportado para extração. Use PDF, DOCX, ODT, XLS/XLSX ou TXT.");
  }

  if (!String(rawText || "").trim()) {
    throw new Error("Não foi possível extrair texto do arquivo.");
  }

  const { templateText: withTokens, fields: detected } = applyBlankTokens(rawText);
  const ensured = ensureFieldsAndAnchors({ templateText: withTokens, fields: detected });

  return {
    title: deriveTitle(file.name, rawText),
    template_text: ensured.templateText,
    template_fields: ensured.fields,
  };
}
