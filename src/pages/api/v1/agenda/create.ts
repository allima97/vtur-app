import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { MODULO_ALIASES } from "../../../../config/modulos";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

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

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requireModuloCreate(client: any, userId: string, modulos: string[], msg: string) {
  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId);
  if (error) throw error;
  const allowed = new Set(modulos.map((mod) => String(mod || "").trim().toLowerCase()));
  const podeCriar = (acessos || []).some((row: any) => {
    if (!row?.ativo) return false;
    if (permLevel(row?.permissao as Permissao) < 2) return false;
    const key = normalizeModulo(row?.modulo);
    if (key && allowed.has(key)) return true;
    const rawKey = String(row?.modulo || "").trim().toLowerCase();
    return rawKey ? allowed.has(rawKey) : false;
  });
  if (!podeCriar) {
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

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");

    if (!isAdmin) {
      const denied = await requireModuloCreate(
        client,
        user.id,
        ["operacao_agenda", "operacao"],
        "Sem permissao para criar eventos."
      );
      if (denied) return denied;
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const titulo = String(body?.titulo || "").trim();
    if (!titulo) return new Response("titulo obrigatorio.", { status: 400 });

    const start = String(body?.start_date || "").trim();
    const end = String(body?.end_date || "").trim() || start;
    if (!start) return new Response("start_date obrigatorio.", { status: 400 });

    const payload = {
      tipo: "evento",
      titulo,
      start_date: start,
      end_date: end,
      all_day: Boolean(body?.all_day),
      descricao: String(body?.descricao || "").trim() || null,
      start_at: String(body?.start_at || "").trim() || null,
      end_at: String(body?.end_at || "").trim() || null,
    };

    const { data, error } = await client
      .from("agenda_itens")
      .insert(payload)
      .select("id, titulo, start_date, end_date, start_at, end_at, descricao, all_day")
      .single();
    if (error) throw error;

    const rangeInicio = String(body?.range_inicio || "").trim();
    const rangeFim = String(body?.range_fim || "").trim();
    if (rangeInicio && rangeFim) {
      await kvCache.delete(["v1", "agendaRange", user.id, rangeInicio, rangeFim].join("|"));
    }

    return new Response(JSON.stringify({ ok: true, item: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro agenda/create", err);
    return new Response("Erro ao criar evento.", { status: 500 });
  }
}
