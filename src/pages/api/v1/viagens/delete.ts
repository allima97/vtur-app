import { createServerClient } from "../../../../lib/supabaseServer";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

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

function resolveRoles(usoIndividual: boolean) {
  const deveRestringirResponsavel = usoIndividual;
  return { deveRestringirResponsavel };
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const denied = await requireModuloDelete(
      client,
      user.id,
      ["operacao", "operacao_viagens"],
      "Sem acesso a Operacao/Viagens."
    );
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const id = String(body?.id || "").trim();
    const vendaId = String(body?.venda_id || "").trim();
    if (!id && !vendaId) return new Response("Parametros invalidos.", { status: 400 });

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("company_id, uso_individual")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const companyId = String((perfil as any)?.company_id || "").trim();
    if (!companyId) return new Response("Empresa nao encontrada.", { status: 400 });

    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    const { deveRestringirResponsavel } = resolveRoles(usoIndividual);

    let deleteQuery = client.from("viagens").delete().eq("company_id", companyId);
    if (deveRestringirResponsavel) {
      deleteQuery = deleteQuery.eq("responsavel_user_id", user.id);
    }

    const { error } = vendaId
      ? await deleteQuery.eq("venda_id", vendaId)
      : await deleteQuery.eq("id", id);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Erro viagens delete:", e);
    return new Response("Erro ao excluir viagem.", { status: 500 });
  }
}
