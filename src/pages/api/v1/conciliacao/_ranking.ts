import type { UserScope } from "../vendas/_utils";

type RankingAssigneeOption = {
  id: string;
  nome_completo: string;
  tipo?: string | null;
};

type RankingProdutoOption = {
  id: string;
  nome: string;
};

function normalizeTipoNome(value: unknown) {
  return String(value || "").trim().toUpperCase();
}

function isAllowedRankingTipo(value: unknown) {
  const tipoNome = normalizeTipoNome(value);
  return (
    tipoNome.includes("VENDEDOR") ||
    tipoNome.includes("GESTOR") ||
    tipoNome.includes("MASTER")
  );
}

async function fetchGestorEquipeIds(client: any, gestorId: string) {
  if (!gestorId) return [] as string[];
  try {
    const { data, error } = await client.rpc("gestor_equipe_vendedor_ids", { uid: gestorId });
    if (error) throw error;
    const ids =
      (data || [])
        .map((row: any) => String(row?.vendedor_id || "").trim())
        .filter(Boolean) || [];
    return Array.from(new Set([gestorId, ...ids]));
  } catch {
    return Array.from(new Set([gestorId]));
  }
}

export async function fetchConciliacaoRankingOptions(params: {
  client: any;
  scope: UserScope;
  companyId: string | null;
}) {
  const { client, scope, companyId } = params;

  if (!companyId) {
    return {
      vendedores: [] as RankingAssigneeOption[],
      produtosMeta: [] as RankingProdutoOption[],
      vendedorIds: [] as string[],
      vendedorIdSet: new Set<string>(),
      produtoIdSet: new Set<string>(),
    };
  }

  let allowedIds: string[] = [];
  if (scope.papel === "GESTOR" && !scope.isAdmin) {
    // IDs da equipe do gestor (inclui o próprio gestor)
    const equipeIds = await fetchGestorEquipeIds(client, scope.userId);

    // Também incluir todos os gestores da mesma empresa (gestores podem se atribuir mutuamente)
    const { data: gestoresData } = await client
      .from("users")
      .select("id, user_types(name)")
      .eq("company_id", companyId)
      .eq("uso_individual", false);

    const gestoresIds = ((gestoresData || []) as any[])
      .filter((row) => isAllowedRankingTipo(row?.user_types?.name))
      .map((row) => String(row?.id || "").trim())
      .filter(Boolean);

    allowedIds = Array.from(new Set([...equipeIds, ...gestoresIds]));
  }

  let usersQuery = client
    .from("users")
    .select("id, nome_completo, user_types(name)")
    .eq("company_id", companyId);

  if (allowedIds.length > 0) {
    usersQuery = usersQuery.in("id", allowedIds);
  }

  const { data: usersData, error: usersErr } = await usersQuery;
  if (usersErr) throw usersErr;

  const vendedores = (usersData || [])
    .filter((row: any) => isAllowedRankingTipo(row?.user_types?.name))
    .map((row: any) => ({
      id: String(row?.id || "").trim(),
      nome_completo: String(row?.nome_completo || "").trim() || "Usuario",
      tipo: String(row?.user_types?.name || "").trim() || null,
    }))
    .filter((row) => Boolean(row.id))
    .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, "pt-BR"));

  const vendedorIds = vendedores.map((row) => row.id);
  const vendedorIdSet = new Set(vendedorIds);

  let produtosMeta: RankingProdutoOption[] = [];
  if (vendedorIds.length > 0) {
    const { data: metasData, error: metasErr } = await client
      .from("metas_vendedor")
      .select("id")
      .eq("ativo", true)
      .in("vendedor_id", vendedorIds);
    if (metasErr) throw metasErr;

    const metaIds =
      (metasData || []).map((row: any) => String(row?.id || "").trim()).filter(Boolean) || [];
    if (metaIds.length > 0) {
      const { data: metasProdutoData, error: metasProdutoErr } = await client
        .from("metas_vendedor_produto")
        .select("produto_id, tipo_produtos(id, nome)")
        .in("meta_vendedor_id", metaIds);
      if (metasProdutoErr) throw metasProdutoErr;

      const byId = new Map<string, RankingProdutoOption>();
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

  return {
    vendedores,
    produtosMeta,
    vendedorIds,
    vendedorIdSet,
    produtoIdSet: new Set(produtosMeta.map((item) => item.id)),
  };
}
