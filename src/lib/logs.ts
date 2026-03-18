import { supabase } from "./supabase";

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

    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent : "";

    if (typeof window !== "undefined" && typeof fetch !== "undefined") {
      try {
        const resp = await fetch("/api/v1/logs/client-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            user_id: resolvedUserId,
            acao,
            modulo,
            detalhes,
          }),
        });
        if (resp.ok) return;
      } catch (_) {}
    }

    await supabase.from("logs").insert({
      user_id: resolvedUserId,
      acao,
      modulo,
      detalhes,
      ip: null,
      user_agent: userAgent
    });
  } catch (error) {
    console.error("Erro ao registrar log:", error);
  }
}
