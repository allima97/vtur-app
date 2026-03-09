import { kvCache } from "../../../../lib/kvCache";
import { buildAuthClient, getUserScope, requireModuloLevel } from "../vendas/_utils";
import { normalizeText } from "../../../../lib/normalizeText";

const CACHE_TTL_SECONDS = 600;

function buildCacheKey() {
  return ["v1", "parametrosNaoComissionaveis"].join("|");
}

function normalizeTermo(value: string) {
  return normalizeText(value || "", { trim: true, collapseWhitespace: true });
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["admin", "admin_dashboard"],
        1,
        "Sem acesso aos parametros."
      );
      if (denied) return denied;
    }

    const cacheKey = buildCacheKey();
    const cached = await kvCache.get<any>(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data, error } = await client
      .from("parametros_pagamentos_nao_comissionaveis")
      .select("id, termo, termo_normalizado, ativo, created_at, updated_at")
      .order("termo", { ascending: true });
    if (error) throw error;

    const payload = { items: data || [] };
    await kvCache.set(cacheKey, payload, CACHE_TTL_SECONDS);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro parametros/nao-comissionaveis", err);
    return new Response("Erro ao carregar criterios.", { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["admin", "admin_dashboard"],
        3,
        "Sem permissao para editar parametros."
      );
      if (denied) return denied;
    }

    const body = (await request.json()) as {
      id?: string | null;
      termo?: string | null;
      ativo?: boolean | null;
    };

    const termo = String(body.termo || "").trim();
    const termoNormalizado = normalizeTermo(termo);
    if (!termoNormalizado) return new Response("Termo invalido.", { status: 400 });

    const payload: any = {
      termo,
      termo_normalizado: termoNormalizado,
      ativo: Boolean(body.ativo),
      updated_at: new Date().toISOString(),
      updated_by: user.id,
    };

    if (body.id) {
      const { error } = await client
        .from("parametros_pagamentos_nao_comissionaveis")
        .update(payload)
        .eq("id", body.id);
      if (error) throw error;
    } else {
      payload.created_by = user.id;
      const { error } = await client
        .from("parametros_pagamentos_nao_comissionaveis")
        .insert(payload);
      if (error) {
        const msg = String(error?.message || "");
        if (msg.toLowerCase().includes("duplicate")) {
          return new Response("Termo duplicado.", { status: 409 });
        }
        throw error;
      }
    }

    await kvCache.delete(buildCacheKey());

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro parametros/nao-comissionaveis POST", err);
    return new Response("Erro ao salvar criterio.", { status: 500 });
  }
}

export async function DELETE({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["admin", "admin_dashboard"],
        3,
        "Sem permissao para editar parametros."
      );
      if (denied) return denied;
    }

    const body = (await request.json()) as { id?: string | null };
    const id = String(body?.id || "").trim();
    if (!id) return new Response("id obrigatorio.", { status: 400 });

    const { error } = await client
      .from("parametros_pagamentos_nao_comissionaveis")
      .delete()
      .eq("id", id);
    if (error) throw error;

    await kvCache.delete(buildCacheKey());

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro parametros/nao-comissionaveis DELETE", err);
    return new Response("Erro ao excluir criterio.", { status: 500 });
  }
}
