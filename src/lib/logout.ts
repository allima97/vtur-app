import { supabase } from "./supabase";
import { registrarLog } from "./logs";
import { clearPermissoesCache } from "./permissoesCache";

export async function logoutUsuario() {
  try {
    // pegar sessão atual
    const { data } = await supabase.auth.getUser();
    const usuarioId = data?.user?.id || null;

    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent : "";

    // REGISTRAR LOG
    await registrarLog({
      user_id: usuarioId,
      acao: "logout",
      modulo: "login",
      detalhes: {
        userAgent,
      },
    });

    // FAZER LOGOUT
    await supabase.auth.signOut();
    clearPermissoesCache();

    // REDIRECIONAR
    window.location.href = "/auth/login";
  } catch (e) {
    console.error("Erro ao sair:", e);
    clearPermissoesCache();
    window.location.href = "/auth/login";
  }
}
