
import { buildAuthClient } from "../vendas/_utils";
import { MODULO_ALIASES } from "../../../../config/modulos";

type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

function permLevel(p?: string | null): number {
  switch (p) {
    case "admin":
      return 5;
    case "delete":
      return 4;
    case "edit":
      return 3;
    case "create":
      return 2;
    case "view":
      return 1;
    default:
      return 0;
  }
}

function normalizeModulo(value?: string | null) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return MODULO_ALIASES[raw] || raw;
}

// parseCookies/buildAuthClient agora vêm de src/lib/apiAuth.ts

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

async function requireModuloDelete(client: any, userId: string, modulos: string[], msg: string) {
  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId);
  if (error) throw error;
  const allowed = new Set(modulos.map((mod) => String(mod || "").trim().toLowerCase()));
  const podeExcluir = (acessos || []).some((row: any) => {
    if (!row?.ativo) return false;
    if (permLevel(row?.permissao as Permissao) < 4) return false;
    const key = normalizeModulo(row?.modulo);
    if (key && allowed.has(key)) return true;
    const rawKey = String(row?.modulo || "").trim().toLowerCase();
    return rawKey ? allowed.has(rawKey) : false;
  });
  if (!podeExcluir) {
    return new Response(msg, { status: 403 });
  }
  return null;
}

export async function DELETE({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");

    if (!isAdmin) {
      const denied = await requireModuloDelete(
        client,
        user.id,
        ["parametros_formas_pagamento", "parametros"],
        "Sem permissao para excluir formas de pagamento."
      );
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });

    const { error } = await client.from("formas_pagamento").delete().eq("id", id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro formas-pagamento/delete", err);
    return new Response("Erro ao excluir forma de pagamento.", { status: 500 });
  }
}
