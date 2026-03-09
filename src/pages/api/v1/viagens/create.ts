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

async function requireModuloCreate(client: any, userId: string, modulos: string[], msg: string) {
  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId)
    .in("modulo", modulos);
  if (error) throw error;
  const pode = (acessos || []).some(
    (row: any) => row?.ativo && permLevel(row?.permissao as Permissao) >= 2
  );
  if (!pode) {
    return new Response(msg, { status: 403 });
  }
  return null;
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const denied = await requireModuloCreate(
      client,
      user.id,
      ["operacao", "operacao_viagens"],
      "Sem acesso a Operacao/Viagens."
    );
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const origem = String(body?.origem || "").trim();
    const destino = String(body?.destino || "").trim();
    const dataInicio = String(body?.data_inicio || "").trim();
    const dataFim = String(body?.data_fim || "").trim();
    const status = String(body?.status || "planejada").trim();
    const clienteId = String(body?.cliente_id || "").trim();

    if (!origem || !destino || !dataInicio || !clienteId) {
      return new Response("Dados obrigatorios ausentes.", { status: 400 });
    }

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const companyId = String((perfil as any)?.company_id || "").trim();
    if (!companyId) return new Response("Empresa nao encontrada.", { status: 400 });

    const payload = {
      company_id: companyId,
      responsavel_user_id: user.id,
      cliente_id: clienteId,
      origem,
      destino,
      data_inicio: dataInicio,
      data_fim: dataFim || null,
      status: status || "planejada",
      orcamento_id: null,
    };

    const { error } = await client.from("viagens").insert(payload);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("Erro viagens create:", e);
    return new Response("Erro ao criar viagem.", { status: 500 });
  }
}
