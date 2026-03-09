import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";

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
    const nome = String(body?.nome || "").trim();
    const cor = String(body?.cor || "").trim() || null;
    if (!nome) return new Response("nome obrigatorio.", { status: 400 });

    const id = String(body?.id || "").trim();
    const isEdit = Boolean(id);
    if (isEdit && !isUuid(id)) return new Response("id invalido.", { status: 400 });

    if (!isAdmin) {
      const minLevel = isEdit ? 3 : 2;
      const denied = await requireModulo(
        client,
        user.id,
        minLevel,
        isEdit ? "Sem permissao para editar categoria." : "Sem permissao para criar categoria."
      );
      if (denied) return denied;
    }

    if (isEdit) {
      const { data, error } = await client
        .from("todo_categorias")
        .update({ nome, cor })
        .eq("id", id)
        .select("id, nome, cor")
        .single();
      if (error) throw error;
      await kvCache.delete(["v1", "todoBoard", user.id].join("|"));
      return new Response(JSON.stringify({ ok: true, item: data }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data, error } = await client
      .from("todo_categorias")
      .insert({ nome, cor, user_id: user.id })
      .select("id, nome, cor")
      .single();
    if (error) throw error;

    await kvCache.delete(["v1", "todoBoard", user.id].join("|"));

    return new Response(JSON.stringify({ ok: true, item: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro todo/category POST", err);
    return new Response("Erro ao salvar categoria.", { status: 500 });
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
      const denied = await requireModulo(client, user.id, 4, "Sem permissao para excluir categoria.");
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });

    const { error } = await client.from("todo_categorias").delete().eq("id", id);
    if (error) throw error;

    await kvCache.delete(["v1", "todoBoard", user.id].join("|"));

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro todo/category DELETE", err);
    return new Response("Erro ao excluir categoria.", { status: 500 });
  }
}
