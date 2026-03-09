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

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

async function requireModuloEdit(client: any, userId: string, modulos: string[], msg: string) {
  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId);
  if (error) throw error;
  const allowed = new Set(modulos.map((mod) => String(mod || "").trim().toLowerCase()));
  const podeEditar = (acessos || []).some((row: any) => {
    if (!row?.ativo) return false;
    if (permLevel(row?.permissao as Permissao) < 3) return false;
    const key = normalizeModulo(row?.modulo);
    if (key && allowed.has(key)) return true;
    const rawKey = String(row?.modulo || "").trim().toLowerCase();
    return rawKey ? allowed.has(rawKey) : false;
  });
  if (!podeEditar) {
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
      const denied = await requireModuloEdit(
        client,
        user.id,
        ["operacao_agenda", "operacao"],
        "Sem permissao para editar agenda."
      );
      if (denied) return denied;
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const id = String(body?.id || "").trim();
    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });

    const payload: any = {};
    if (body?.title !== undefined) payload.titulo = String(body.title || "").trim();
    if (body?.descricao !== undefined) {
      payload.descricao = String(body.descricao || "").trim() || null;
    }
    if (body?.allDay !== undefined) payload.all_day = Boolean(body.allDay);

    if (body?.start !== undefined) {
      const startISO = String(body.start || "").trim();
      if (startISO) {
        payload.start_date = startISO.split("T")[0];
        payload.start_at = startISO.includes("T") ? startISO : null;
      }
    }

    if (body?.end !== undefined) {
      const endISO = String(body.end || "").trim();
      if (endISO) {
        payload.end_date = endISO.split("T")[0] || payload.start_date;
        payload.end_at = endISO.includes("T") ? endISO : null;
      } else if (payload.start_date) {
        payload.end_date = payload.start_date;
        payload.end_at = null;
      }
    }

    if (!Object.keys(payload).length) {
      return new Response("payload vazio.", { status: 400 });
    }

    const { error } = await client.from("agenda_itens").update(payload).eq("id", id);
    if (error) throw error;

    const rangeInicio = String(body?.range_inicio || "").trim();
    const rangeFim = String(body?.range_fim || "").trim();
    if (rangeInicio && rangeFim) {
      await kvCache.delete(["v1", "agendaRange", user.id, rangeInicio, rangeFim].join("|"));
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro agenda/update", err);
    return new Response("Erro ao atualizar agenda.", { status: 500 });
  }
}
