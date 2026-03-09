import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";

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

type TodoStatus = "novo" | "agendado" | "em_andamento" | "concluido";

type UpdateInput = {
  id: string;
  status?: TodoStatus;
  categoria_id?: string | null;
  done?: boolean;
};

function normalizeUpdates(raw: unknown): UpdateInput[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const id = String((item as any)?.id || "").trim();
      if (!isUuid(id)) return null;
      const statusRaw = (item as any)?.status;
      const status = statusRaw ? String(statusRaw).trim() : undefined;
      const categoriaRaw = (item as any)?.categoria_id;
      const categoriaId =
        categoriaRaw === null || categoriaRaw === undefined
          ? categoriaRaw
          : String(categoriaRaw).trim();

      const doneRaw = (item as any)?.done;
      const done = typeof doneRaw === "boolean" ? doneRaw : undefined;

      const normalized: UpdateInput = { id };
      if (status === "novo" || status === "agendado" || status === "em_andamento" || status === "concluido") {
        normalized.status = status;
      }
      if (categoriaId === null || categoriaId === undefined) {
        // no-op (undefined) ou explicit null
        if (categoriaRaw === null) normalized.categoria_id = null;
      } else if (isUuid(categoriaId)) {
        normalized.categoria_id = categoriaId;
      }
      if (done !== undefined) normalized.done = done;
      if (!normalized.status && normalized.categoria_id === undefined && normalized.done === undefined) {
        return null;
      }
      return normalized;
    })
    .filter(Boolean) as UpdateInput[];
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
      const { data: acessos, error: acessoErr } = await client
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id)
        .in("modulo", ["operacao_todo", "operacao"]);
      if (acessoErr) throw acessoErr;
      const podeEditar = (acessos || []).some(
        (row: any) => row?.ativo && permLevel(row?.permissao as Permissao) >= 3
      );
      const podeCriar = (acessos || []).some(
        (row: any) => row?.ativo && permLevel(row?.permissao as Permissao) >= 2
      );
      // Para batch de updates, exigimos pelo menos edit ou create (dependendo do seu modelo de permissões).
      if (!podeEditar && !podeCriar) {
        return new Response("Sem permissão para atualizar tarefas.", { status: 403 });
      }
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody);
    const updates = normalizeUpdates((body as any)?.updates).slice(0, 120);
    if (!updates.length) {
      return new Response("updates obrigatorio.", { status: 400 });
    }

    let updated = 0;
    const errors: Array<{ id: string; message: string }> = [];

    for (const u of updates) {
      const payload: any = {};
      if (u.status) {
        payload.status = u.status;
        // Mantém a regra atual do app: feito = done true
        if (u.done === undefined) {
          payload.done = u.status === "em_andamento" || u.status === "concluido";
        }
      }
      if (u.done !== undefined) payload.done = u.done;
      if (u.categoria_id !== undefined) payload.categoria_id = u.categoria_id;

      if (!Object.keys(payload).length) continue;

      const { error } = await client.from("agenda_itens").update(payload).eq("id", u.id);
      if (error) {
        errors.push({ id: u.id, message: String((error as any)?.message || error) });
        continue;
      }
      updated += 1;
    }

    if (updated > 0) {
      await kvCache.delete(["v1", "todoBoard", user.id].join("|"));
    }

    return new Response(JSON.stringify({ ok: errors.length === 0, updated, errors }), {
      status: errors.length ? 207 : 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro todo/batch", err);
    return new Response("Erro ao atualizar tarefas.", { status: 500 });
  }
}

