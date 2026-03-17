import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);
    if (!scope.isAdmin && scope.papel !== "GESTOR" && scope.papel !== "MASTER") {
      return new Response("Sem permissao.", { status: 403 });
    }

    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["Conciliação"],
        3,
        "Sem acesso a Conciliação."
      );
      if (denied) return denied;
    }

    const body = (await request.json().catch(() => null)) as {
      companyId?: string | null;
      conciliacaoId?: string | null;
      rankingVendedorId?: string | null;
      rankingProdutoId?: string | null;
    } | null;

    const companyId = resolveCompanyId(scope, body?.companyId || null);
    if (!companyId) return new Response("Company invalida.", { status: 400 });

    const conciliacaoId = String(body?.conciliacaoId || "").trim();
    if (!isUuid(conciliacaoId)) {
      return new Response("Registro de conciliacao invalido.", { status: 400 });
    }

    const rankingVendedorId = String(body?.rankingVendedorId || "").trim() || null;
    const rankingProdutoId = String(body?.rankingProdutoId || "").trim() || null;

    if (rankingVendedorId && !isUuid(rankingVendedorId)) {
      return new Response("Vendedor invalido.", { status: 400 });
    }
    if (rankingProdutoId && !isUuid(rankingProdutoId)) {
      return new Response("Produto invalido.", { status: 400 });
    }

    const { data: registro, error: registroErr } = await client
      .from("conciliacao_recibos")
      .select("id, company_id")
      .eq("id", conciliacaoId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (registroErr) throw registroErr;
    if (!registro) return new Response("Registro nao encontrado.", { status: 404 });

    if (rankingVendedorId) {
      const { data: vendedor, error: vendedorErr } = await client
        .from("users")
        .select("id, company_id, user_types(name)")
        .eq("id", rankingVendedorId)
        .maybeSingle();
      if (vendedorErr) throw vendedorErr;
      if (!vendedor || String((vendedor as any)?.company_id || "") !== companyId) {
        return new Response("Vendedor nao pertence a empresa selecionada.", { status: 400 });
      }
      const tipoNome = String((vendedor as any)?.user_types?.name || "").toUpperCase();
      const vendedorValido = tipoNome.includes("VENDEDOR") || tipoNome.includes("GESTOR");
      if (!vendedorValido) {
        return new Response("Atribua apenas vendedores ou gestores ao ranking.", { status: 400 });
      }
    }

    if (rankingProdutoId) {
      const { data: produto, error: produtoErr } = await client
        .from("tipo_produtos")
        .select("id")
        .eq("id", rankingProdutoId)
        .maybeSingle();
      if (produtoErr) throw produtoErr;
      if (!produto) return new Response("Produto nao encontrado.", { status: 404 });
    }

    const payload = {
      ranking_vendedor_id: rankingVendedorId,
      ranking_produto_id: rankingProdutoId,
      ranking_assigned_by: user.id,
      ranking_assigned_at: new Date().toISOString(),
    };

    const { data, error } = await client
      .from("conciliacao_recibos")
      .update(payload)
      .eq("id", conciliacaoId)
      .eq("company_id", companyId)
      .select("id, ranking_vendedor_id, ranking_produto_id, ranking_assigned_at")
      .maybeSingle();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, item: data || null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/assign", err);
    return new Response(err?.message || "Erro ao atribuir recibo ao ranking.", { status: 500 });
  }
};