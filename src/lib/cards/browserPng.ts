export type ServerPngCheckResult =
  | { ok: true }
  | { ok: false; reason: "not_png" | "png_unavailable"; message: string };

const XLINK_NS = "http://www.w3.org/1999/xlink";

function parseSvgNumber(value: string | null) {
  if (!value) return null;
  const match = String(value).trim().match(/[\d.]+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSvgSize(svgText: string) {
  if (!svgText) return {};
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  const width = parseSvgNumber(svg.getAttribute("width"));
  const height = parseSvgNumber(svg.getAttribute("height"));
  if (width && height) return { width, height };
  const viewBox = svg.getAttribute("viewBox");
  if (!viewBox) return {};
  const parts = viewBox.split(/[\s,]+/).map((part) => Number(part));
  if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
    return { width: parts[2], height: parts[3] };
  }
  return {};
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar SVG para conversão PNG."));
    img.src = src;
  });
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao converter arte para Data URL."));
    reader.readAsDataURL(blob);
  });
}

function getImageHref(imageEl: Element) {
  return (
    String(imageEl.getAttribute("href") || "").trim() ||
    String(imageEl.getAttributeNS(XLINK_NS, "href") || "").trim()
  );
}

function setImageHref(imageEl: Element, href: string) {
  imageEl.setAttribute("href", href);
  imageEl.setAttributeNS(XLINK_NS, "xlink:href", href);
}

async function inlineExternalSvgImages(svgText: string) {
  if (!svgText.trim()) return svgText;
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const images = Array.from(doc.querySelectorAll("image"));
  if (images.length === 0) return svgText;

  await Promise.all(
    images.map(async (imageEl) => {
      const href = getImageHref(imageEl);
      if (!/^https?:\/\//i.test(href)) return;
      try {
        const response = await fetch(href, { cache: "force-cache" });
        if (!response.ok) return;
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (!dataUrl) return;
        setImageHref(imageEl, dataUrl);
      } catch {
        // Mantém o href original se não for possível embutir.
      }
    })
  );

  return new XMLSerializer().serializeToString(doc);
}

export async function validarPngServidor(cardPngUrl: string): Promise<ServerPngCheckResult> {
  const response = await fetch(cardPngUrl, {
    method: "GET",
    headers: { Accept: "image/png" },
    cache: "no-store",
  });
  if (response.ok) {
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("image/png")) return { ok: true };
    return {
      ok: false,
      reason: "not_png",
      message: "A rota /render.png não retornou PNG real.",
    };
  }

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  const apiError = String(payload?.error || "").trim().toLowerCase();
  if (apiError === "png_render_unavailable" || response.status === 503) {
    return {
      ok: false,
      reason: "png_unavailable",
      message: "PNG indisponível no runtime atual do servidor.",
    };
  }

  const textDetail = await response.text().catch(() => "");
  const detail = String(payload?.message || payload?.error || textDetail || "").trim();
  throw new Error(detail || "Falha ao renderizar cartão PNG.");
}

export async function renderSvgTextToPngBlob(svgText: string) {
  if (!svgText.trim()) throw new Error("SVG vazio para conversão PNG.");
  const svgPrepared = await inlineExternalSvgImages(svgText);
  const svgBlob = new Blob([svgPrepared], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);
  try {
    const img = await loadImage(svgUrl);
    const svgSize = parseSvgSize(svgPrepared);
    const width = Math.max(1, Math.round(svgSize.width || img.naturalWidth || img.width || 320));
    const height = Math.max(1, Math.round(svgSize.height || img.naturalHeight || img.height || 120));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Falha ao inicializar canvas para conversão PNG.");
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Falha ao gerar PNG no navegador."));
        },
        "image/png",
        1
      );
    });

    return pngBlob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function renderSvgUrlToPngBlob(svgUrl: string) {
  const response = await fetch(svgUrl, {
    method: "GET",
    headers: { Accept: "image/svg+xml,text/plain;q=0.9,*/*;q=0.8" },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || "Falha ao carregar SVG para conversão PNG.");
  }
  const svgText = await response.text();
  return renderSvgTextToPngBlob(svgText);
}

export async function renderSvgUrlToPngObjectUrl(svgUrl: string) {
  const pngBlob = await renderSvgUrlToPngBlob(svgUrl);
  return URL.createObjectURL(pngBlob);
}
