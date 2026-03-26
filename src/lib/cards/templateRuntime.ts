import { getPrimeiroNome } from "../whatsapp";

export const DEFAULT_CARD_FOOTER_LEAD = "Com carinho";
export const DEFAULT_CARD_CONSULTANT_ROLE = "Consultor de viagens";

export function buildCardClientGreeting(nomeCompleto?: string | null) {
  const nome = String(nomeCompleto || "").trim();
  if (!nome) return "Prezado(a) Cliente,";
  return `Prezado(a) ${getPrimeiroNome(nome) || nome},`;
}
