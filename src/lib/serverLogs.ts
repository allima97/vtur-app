import { supabaseServer } from "./supabaseServer";

function resolveRequestIp(request?: Request | null) {
  if (!request) return "";
  const forwarded =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    "";
  return String(forwarded).split(",")[0]?.trim() || "";
}

function resolveUserAgent(request?: Request | null) {
  if (!request) return "";
  return String(request.headers.get("user-agent") || "").trim();
}

export async function registrarLogServidor({
  user_id,
  acao,
  modulo,
  detalhes = {},
  request,
}: {
  user_id?: string | null;
  acao: string;
  modulo: string;
  detalhes?: any;
  request?: Request | null;
}) {
  try {
    await supabaseServer.from("logs").insert({
      user_id: user_id ?? null,
      acao,
      modulo,
      detalhes,
      ip: resolveRequestIp(request),
      user_agent: resolveUserAgent(request),
    });
  } catch (error) {
    console.error("Erro ao registrar log servidor:", error);
  }
}
