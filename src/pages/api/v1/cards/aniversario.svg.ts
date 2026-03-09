function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const nome = String(url.searchParams.get("nome") || "Cliente").trim() || "Cliente";
  const assinatura = String(url.searchParams.get("assinatura") || "André Lima").trim() || "André Lima";

  const nomeEsc = escapeXml(nome);
  const assinaturaEsc = escapeXml(assinatura);
  const tituloFontSize = nome.length > 10 ? 34 : 40;
  const assinaturaFontSize = assinatura.length > 18 ? 20 : assinatura.length > 12 ? 22 : 24;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="375" height="667" viewBox="0 0 375 667">
  <defs>
    <radialGradient id="g1" cx="0.12" cy="0.93" r="0.35">
      <stop offset="0" stop-color="#71D6AF" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#71D6AF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="0.92" cy="0.07" r="0.3">
      <stop offset="0" stop-color="#6FC8AF" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#6FC8AF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="logoGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#1a29c8"/>
      <stop offset="0.62" stop-color="#172acb"/>
      <stop offset="1" stop-color="#43bb83"/>
    </linearGradient>
  </defs>
  <rect width="375" height="667" fill="#F5F8FC"/>
  <rect width="375" height="667" fill="url(#g1)"/>
  <rect width="375" height="667" fill="url(#g2)"/>

  <g fill="none" stroke="#8EBED4" stroke-width="3" opacity="0.45">
    <circle cx="345" cy="62" r="88"/>
    <circle cx="345" cy="62" r="105"/>
    <circle cx="20" cy="585" r="122"/>
    <circle cx="20" cy="585" r="146"/>
  </g>
  <g fill="none" stroke="#8BCBB2" stroke-width="4">
    <path d="M142 74c8-11 21-19 35-21 23-4 46 5 61 23"/>
    <path d="M238 138c-8 11-21 19-35 21-23 4-46-5-61-23"/>
  </g>
  <text x="188" y="118" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="54" font-weight="700" fill="url(#logoGrad)">CVC</text>

  <g fill="#7FB5CE" stroke="#7FB5CE" stroke-width="2.5" opacity="0.85">
    <path d="M20 199l20 10m-11-26l9 11m-22 6l30-1m-23 13l18-8" />
    <path d="M26 198l19-12 9 12-7 4-1 7-5 4-7-4-4 1z" fill="none"/>
  </g>

  <g fill="none" stroke="#8AC9B1" stroke-width="4" opacity="0.9">
    <rect x="142" y="473" width="40" height="50" rx="4"/>
    <rect x="135" y="480" width="40" height="50" rx="4"/>
    <path d="M149 480v50m20-50v50m-34-32h40m-23-18c0-6 4-11 10-11 7 0 10 5 10 11"/>
  </g>

  <g fill="none" stroke="#83A9D4" stroke-width="4" opacity="0.95">
    <circle cx="344" cy="480" r="23"/>
    <path d="M344 454v-11m0 72v11m25-47h11m-72 0h11m56-19l8-8m-78 78l8-8m0-63l-8-8m78 78l-8-8"/>
  </g>

  <text x="188" y="270" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${tituloFontSize}" font-weight="600" fill="#0A0A0A">${nomeEsc}, feliz</text>
  <text x="188" y="314" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${tituloFontSize}" font-weight="600" fill="#0A0A0A">aniversário!</text>

  <text x="188" y="390" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" fill="#101010">Que seu novo ano seja cheio</text>
  <text x="188" y="433" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" fill="#101010">de viagens, conquistas e</text>
  <text x="188" y="476" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" fill="#101010">momentos inesquecíveis.</text>
  <text x="188" y="518" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="24" fill="#101010">Aproveite cada instante!</text>

  <text x="220" y="598" text-anchor="start" font-family="Inter, Arial, sans-serif" font-size="24" font-style="italic" fill="#0A0A0A">Com carinho,</text>
  <text x="220" y="638" text-anchor="start" font-family="Inter, Arial, sans-serif" font-size="${assinaturaFontSize}" font-style="italic" fill="#0A0A0A">${assinaturaEsc}</text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
