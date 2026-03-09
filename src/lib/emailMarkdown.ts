function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(raw: string) {
  const url = (raw || "").trim();
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:")) {
    return url;
  }
  return "";
}

function applyInlineFormatting(value: string) {
  let html = value;
  html = html.replace(/~~(.*?)~~/g, "<del>$1</del>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "$1<em>$2</em>");
  return html;
}

function linkify(text: string) {
  let html = text;

  html = html.replace(
    /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/gi,
    (email) => {
      const safe = sanitizeUrl(`mailto:${email}`);
      if (!safe) return email;
      return `<a href="${safe}">${email}</a>`;
    }
  );

  const urlRegex = /(?<!["'=])\b((https?:\/\/|www\.)[^\s<]+)\b/gi;
  html = html.replace(urlRegex, (raw) => {
    const trimmed = raw.replace(/[),.;:!?]+$/g, "");
    const suffix = raw.slice(trimmed.length);
    const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const safe = sanitizeUrl(href);
    if (!safe) return raw;
    return `<a href="${safe}" target="_blank" rel="noreferrer">${trimmed}</a>${suffix}`;
  });

  return html;
}

function renderInline(markdown: string) {
  let html = markdown;
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, (_m, text, url) => {
    const safe = sanitizeUrl(String(url || ""));
    if (!safe) return text;
    return `<a href="${safe}" target="_blank" rel="noreferrer">${text}</a>`;
  });
  html = applyInlineFormatting(html);
  html = linkify(html);
  return html;
}

export function renderEmailHtml(markdown: string) {
  const escaped = escapeHtml(markdown || "");
  const normalized = escaped.replace(/\r\n/g, "\n");

  const lines = normalized.split("\n");
  let html = "";
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (!listType) return;
    html += `</${listType}>`;
    listType = null;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trimEnd();
    const unordered = line.match(/^\s*[-*\u2022]\s+(.+)$/);
    const ordered = line.match(/^\s*(\d{1,3})[.)]\s+(.+)$/);
    if (unordered) {
      if (listType !== "ul") {
        closeList();
        html += "<ul>";
        listType = "ul";
      }
      html += `<li>${renderInline(unordered[1])}</li>`;
      return;
    }
    if (ordered) {
      if (listType !== "ol") {
        closeList();
        html += "<ol>";
        listType = "ol";
      }
      html += `<li>${renderInline(ordered[2])}</li>`;
      return;
    }
    closeList();
    if (!line.trim()) {
      html += "<br/>";
      return;
    }
    html += `${renderInline(line)}<br/>`;
  });
  closeList();

  return `<div>${html}</div>`;
}

export function renderEmailText(markdown: string) {
  let text = String(markdown || "");
  text = text.replace(/\r\n/g, "\n");
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)");
  text = text.replace(/^\s*[-*\u2022]\s+/gm, "- ");
  text = text.replace(/^\s*(\d{1,3})[.)]\s+/gm, "$1. ");
  text = text.replace(/[*_~`]/g, "");
  return text;
}
