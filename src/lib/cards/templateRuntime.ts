import { getPrimeiroNome } from "../whatsapp";

export const DEFAULT_CARD_FOOTER_LEAD = "Com carinho";
export const DEFAULT_CARD_CONSULTANT_ROLE = "Consultor de viagens";

export function buildCardClientGreeting(nomeCompleto?: string | null) {
  const nome = String(nomeCompleto || "").trim();
  if (!nome) return "Cliente,";
  return `${getPrimeiroNome(nome) || nome},`;
}
