type ExtractPlainTextOptions = {
  maxPages?: number;
};

function fileExt(name: string) {
  const base = String(name || "").trim();
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : "";
}

function normalizeNewlines(text: string) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlToText(html: string) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const parts: string[] = [];

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

    const blockTags = new Set([
      "p",
      "div",
      "section",
      "article",
      "header",
      "footer",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "li",
      "tr",
    ]);
    const isBlock = blockTags.has(tag);
    if (isBlock) parts.push("\n");

    for (const child of Array.from(el.childNodes)) walk(child);

    if (isBlock) parts.push("\n");
  };

  walk(doc.body);

  return normalizeNewlines(
    parts
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .trim()
  );
}

async function extractDocxText(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const mammoth = await import("mammoth/mammoth.browser");
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return htmlToText(result?.value || "");
}

export async function extractPlainTextFromFile(file: File, options: ExtractPlainTextOptions = {}) {
  if (!file) throw new Error("Arquivo obrigatório.");

  const ext = fileExt(file.name);
  const maxPages = Number.isFinite(options.maxPages) ? Number(options.maxPages) : 12;

  let rawText = "";
  if (ext === "pdf") {
    const { extractPdfText } = await import("../vendas/contratoCvcExtractor");
    rawText = await extractPdfText(file, { maxPages });
  } else if (ext === "docx") {
    rawText = await extractDocxText(file);
  } else if (ext === "txt") {
    rawText = await file.text();
  } else {
    throw new Error("Formato não suportado. Use PDF ou Word (.docx).");
  }

  const normalized = normalizeNewlines(rawText);
  if (!normalized) throw new Error("Não foi possível extrair texto do arquivo.");
  return normalized;
}
