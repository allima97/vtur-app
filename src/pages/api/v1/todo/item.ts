import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

type TodoStatus = "novo" | "agendado" | "em_andamento" | "concluido";

type TodoPrioridade = "alta" | "media" | "baixa";

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

async function requireModulo(client: any, userId: string, minLevel: number, msg: string) {
  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId)
    .in("modulo", ["operacao_todo", "operacao"]);
  if (error) throw error;
  const ok = (acessos || []).some(
    (row: any) => row?.ativo && permLevel(row?.permissao as Permissao) >= minLevel
  );
  if (!ok) return new Response(msg, { status: 403 });
  return null;
}

function normalizeStatus(value: unknown): TodoStatus {
  const status = String(value || "").trim();
  if (status === "agendado" || status === "em_andamento" || status === "concluido") return status;
  return "novo";
}

function normalizePrioridade(value: unknown): TodoPrioridade {
  const prio = String(value || "").trim();
  if (prio === "alta" || prio === "media" || prio === "baixa") return prio;
  return "media";
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

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const titulo = String(body?.titulo || "").trim();
    if (!titulo) return new Response("titulo obrigatorio.", { status: 400 });

    const id = String(body?.id || "").trim();
    const isEdit = Boolean(id);
    if (isEdit && !isUuid(id)) return new Response("id invalido.", { status: 400 });

    if (!isAdmin) {
      const minLevel = isEdit ? 3 : 2;
      const denied = await requireModulo(
        client,
        user.id,
        minLevel,
        isEdit ? "Sem permissao para editar tarefa." : "Sem permissao para criar tarefa."
      );
      if (denied) return denied;
    }

    const payload = {
      titulo,
      descricao: String(body?.descricao || "").trim() || null,
      categoria_id: body?.categoria_id === null ? null : String(body?.categoria_id || "").trim() || null,
      prioridade: normalizePrioridade(body?.prioridade),
      status: normalizeStatus(body?.status),
    };

    if (isEdit) {
      const { data, error } = await client
        .from("agenda_itens")
        .update(payload)
        .eq("id", id)
        .select("id, titulo, descricao, done, categoria_id, prioridade, status")
        .single();
      if (error) throw error;
      await kvCache.delete(["v1", "todoBoard", user.id].join("|"));
      return new Response(JSON.stringify({ ok: true, item: data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const insertPayload = {
      ...payload,
      tipo: "todo",
    };

    const { data, error } = await client
      .from("agenda_itens")
      .insert(insertPayload)
      .select("id, titulo, descricao, done, categoria_id, prioridade, status")
      .single();
    if (error) throw error;

    await kvCache.delete(["v1", "todoBoard", user.id].join("|"));

    return new Response(JSON.stringify({ ok: true, item: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro todo/item POST", err);
    return new Response("Erro ao salvar tarefa.", { status: 500 });
  }
}

export async function PATCH({ request }: { request: Request }) {
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
      const denied = await requireModulo(client, user.id, 3, "Sem permissao para arquivar tarefa.");
      if (denied) return denied;
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const id = String(body?.id || "").trim();
    const action = String(body?.action || "").trim();
    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });
    if (action !== "archive" && action !== "restore") return new Response("action invalida.", { status: 400 });

    const arquivo = action === "archive" ? new Date().toISOString() : null;
    const { data, error } = await client
      .from("agenda_itens")
      .update({ arquivo })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, arquivo")
      .single();
    if (error) throw error;

    await kvCache.delete(["v1", "todoBoard", user.id].join("|"));

    return new Response(JSON.stringify({ ok: true, item: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro todo/item PATCH", err);
    return new Response("Erro ao arquivar tarefa.", { status: 500 });
  }
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
      const denied = await requireModulo(client, user.id, 4, "Sem permissao para excluir tarefa.");
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });

    const { error } = await client.from("agenda_itens").delete().eq("id", id);
    if (error) throw error;

    await kvCache.delete(["v1", "todoBoard", user.id].join("|"));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro todo/item DELETE", err);
    return new Response("Erro ao excluir tarefa.", { status: 500 });
  }
}
