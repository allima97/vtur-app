import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import { fetchConciliacaoRankingOptions } from "./_ranking";

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

    const { vendedores, produtosMeta } = await fetchConciliacaoRankingOptions({
      client,
      scope,
      companyId,
    });

    return new Response(JSON.stringify({ vendedores, produtosMeta }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/options", err);
    return new Response(err?.message || "Erro ao carregar opcoes da conciliacao.", { status: 500 });
  }
};
