import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";

export const GET: APIRoute = async ({ request }) => {
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
        1,
        "Sem acesso a Conciliação."
      );
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const companyId = resolveCompanyId(scope, url.searchParams.get("company_id"));
    if (!companyId) {
      return new Response(JSON.stringify({ vendedores: [], produtosMeta: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: usersData, error: usersErr } = await client
      .from("users")
      .select("id, nome_completo, user_types(name)")
      .eq("company_id", companyId);
    if (usersErr) throw usersErr;

    const vendedores = (usersData || [])
      .filter((row: any) => {
        const tipoNome = String(row?.user_types?.name || "").toUpperCase();
        return tipoNome.includes("VENDEDOR") || tipoNome.includes("GESTOR");
      })
      .map((row: any) => ({
        id: String(row?.id || "").trim(),
        nome_completo: String(row?.nome_completo || "").trim() || "Usuario",
        tipo: String(row?.user_types?.name || "").trim() || null,
      }))
      .filter((row) => Boolean(row.id))
      .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, "pt-BR"));

    const vendedorIds = vendedores.map((row) => row.id);

    let produtosMeta: { id: string; nome: string }[] = [];
    if (vendedorIds.length > 0) {
      const { data: metasData, error: metasErr } = await client
        .from("metas_vendedor")
        .select("id")
        .eq("ativo", true)
        .in("vendedor_id", vendedorIds);
      if (metasErr) throw metasErr;

      const metaIds = (metasData || []).map((row: any) => String(row?.id || "").trim()).filter(Boolean);
      if (metaIds.length > 0) {
        const { data: metasProdutoData, error: metasProdutoErr } = await client
          .from("metas_vendedor_produto")
          .select("produto_id, tipo_produtos(id, nome)")
          .in("meta_vendedor_id", metaIds);
        if (metasProdutoErr) throw metasProdutoErr;

        const byId = new Map<string, { id: string; nome: string }>();
        (metasProdutoData || []).forEach((row: any) => {
          const produtoId = String(row?.produto_id || row?.tipo_produtos?.id || "").trim();
          if (!produtoId || byId.has(produtoId)) return;
          byId.set(produtoId, {
            id: produtoId,
            nome: String(row?.tipo_produtos?.nome || "").trim() || "Produto",
          });
        });
        produtosMeta = Array.from(byId.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      }
    }

    return new Response(JSON.stringify({ vendedores, produtosMeta }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/options", err);
    return new Response(err?.message || "Erro ao carregar opcoes da conciliacao.", { status: 500 });
  }
};