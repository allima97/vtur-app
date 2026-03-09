import { createServerClient } from "../../../../lib/supabaseServer";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

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

function resolvePapel(tipoNome: string, usoIndividual: boolean): Papel {
  if (usoIndividual) return "VENDEDOR";
  const tipo = String(tipoNome || "").toUpperCase();
  if (tipo.includes("ADMIN")) return "ADMIN";
  if (tipo.includes("MASTER")) return "MASTER";
  if (tipo.includes("GESTOR")) return "GESTOR";
  if (tipo.includes("VENDEDOR")) return "VENDEDOR";
  return "OUTRO";
}

function parseCookies(request: Request): Map<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const map = new Map<string, string>();
  header.split(";").forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const [rawName, ...rawValue] = trimmed.split("=");
    const name = rawName?.trim();
    if (!name) return;
    map.set(name, rawValue.join("=").trim());
  });
  return map;
}

function buildAuthClient(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("PUBLIC_SUPABASE_URL ou PUBLIC_SUPABASE_ANON_KEY nao configurados.");
  }
  const cookies = parseCookies(request);
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (name: string) => cookies.get(name) ?? "",
      set: () => {},
      remove: () => {},
    },
  });
}

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
    .eq("usuario_id", userId)
    .in("modulo", modulos);
  if (error) throw error;
  const pode = (acessos || []).some(
    (row: any) => row?.ativo && permLevel(row?.permissao as Permissao) >= 4
  );
  if (!pode) {
    return new Response(msg, { status: 403 });
  }
  return null;
}

export async function DELETE({ request }: { request: Request }) {
  try {
    return new Response("Exclusão de cliente desabilitada.", { status: 403 });

    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const url = new URL(request.url);
    const clienteId = String(url.searchParams.get("id") || "").trim();

    if (!isUuid(clienteId)) {
      return new Response("id invalido.", { status: 400 });
    }

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "");
    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    const papel = resolvePapel(tipoName, usoIndividual);

    if (papel !== "ADMIN") {
      const denied = await requireModuloDelete(
        client,
        user.id,
        ["clientes", "clientes_consulta"],
        "Sem acesso para excluir Clientes."
      );
      if (denied) return denied;
    }

    const { error } = await client.from("clientes").delete().eq("id", clienteId);
    if (error) {
      const status = (error as any)?.status;
      const code = String((error as any)?.code || "");
      if (status === 401 || status === 403 || code === "42501") {
        return new Response("Exclusão de cliente não permitida.", { status: 403 });
      }
      throw error;
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    console.error("Erro clientes/delete", err);
    return new Response("Erro ao excluir cliente.", { status: 500 });
  }
}
