export function construirLinkWhatsApp(numero?: string | null, codigoPais?: string | null) {
  if (!numero) return null;
  const digits = numero.replace(/\D/g, "");
  if (!digits) return null;
  const countryDigits = (codigoPais || "").replace(/\D/g, "");
  const fullNumber =
    countryDigits && !digits.startsWith(countryDigits) ? `${countryDigits}${digits}` : digits;
  return `https://wa.me/${fullNumber}`;
}

export function getPrimeiroNome(nomeCompleto?: string | null) {
  if (!nomeCompleto) return "";
  return nomeCompleto.trim().split(/\s+/)[0] || "";
}

export function getSaudacaoPorHora(date = new Date()) {
  const hora = date.getHours();
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function construirLinkWhatsAppComTexto(
  numero?: string | null,
  texto?: string | null,
  codigoPais?: string | null
) {
  const base = construirLinkWhatsApp(numero, codigoPais);
  if (!base) return null;
  if (!texto) return base;
  return `${base}?text=${encodeURIComponent(texto)}`;
}

export function montarMensagemAniversario(nomeCompleto?: string | null, assinatura = "André Lima") {
  const primeiroNome = getPrimeiroNome(nomeCompleto) || "Cliente";
  return `${primeiroNome}, feliz aniversário!

Que seu novo ano seja cheio de viagens,
conquistas e momentos inesquecíveis.

Aproveite cada instante!

Com carinho,
${assinatura}`;
}

export function construirUrlCartaoAniversario(
  nomeCompleto?: string | null,
  assinatura = "André Lima",
  origin?: string | null
) {
  const primeiroNome = getPrimeiroNome(nomeCompleto) || "Cliente";
  const baseOrigin = (origin || "").trim() || (typeof window !== "undefined" ? window.location.origin : "");
  if (!baseOrigin) return "";
  const params = new URLSearchParams({
    nome: primeiroNome,
    theme_name: "birthday-elegant",
    width: "1080",
    height: "1080",
    titulo: "Feliz Aniversário!",
    corpo: "Que seu novo ano seja cheio de viagens, conquistas e momentos inesquecíveis.\nAproveite cada instante!",
    assinatura,
    v: String(Date.now()),
  });
  return `${baseOrigin}/api/v1/cards/render.svg?${params.toString()}`;
}

export function montarMensagemFollowUp(nomeCompleto?: string | null, assinatura = "André Lima") {
  const saudacao = getSaudacaoPorHora();
  const primeiroNome = getPrimeiroNome(nomeCompleto) || "cliente";
  return `${saudacao} Sr./Sra. ${primeiroNome}, tudo bem?

Estou passando para saber como foi sua viagem.
Espero que tenha corrido tudo bem!

Quando tiver um tempinho, ficarei muito grato
se puder me enviar um feedback sobre sua experiência.

Muito obrigado!

${assinatura}`;
}
