import { supabase } from "./supabase";

let cachedIpPromise: Promise<string> | null = null;

async function resolveClientIp() {
  if (typeof window === "undefined" || typeof fetch === "undefined") return "";
  if (!cachedIpPromise) {
    cachedIpPromise = fetch("https://api.ipify.org?format=json")
      .then((resp) => resp.json())
      .then((j) => String(j?.ip || "").trim())
      .catch(() => "");
  }
  return cachedIpPromise;
}

export async function registrarLog({
  user_id,
  acao,
  modulo,
  detalhes = {}
}: {
  user_id?: string | null;
  acao: string;
  modulo: string;
  detalhes?: any;
}) {
  try {
    let resolvedUserId = user_id ?? null;
    if (!resolvedUserId) {
      try {
        const { data } = await supabase.auth.getUser();
        resolvedUserId = data?.user?.id ?? null;
      } catch (_) {}
    }

    const ip = await resolveClientIp();

    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent : "";

    await supabase.from("logs").insert({
      user_id: resolvedUserId,
      acao,
      modulo,
      detalhes,
      ip,
      user_agent: userAgent
    });
  } catch (error) {
    console.error("Erro ao registrar log:", error);
  }
}
