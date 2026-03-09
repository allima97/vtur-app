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
    const requestedCompanyId = url.searchParams.get("company_id");
    const companyId = resolveCompanyId(scope, requestedCompanyId);
    if (!companyId) return new Response(JSON.stringify([]), { status: 200 });

    const somentePendentes = url.searchParams.get("pending") === "1";

    let query = client
      .from("conciliacao_recibo_changes")
      .select(
        "id, company_id, conciliacao_recibo_id, venda_id, venda_recibo_id, numero_recibo, field, old_value, new_value, actor, changed_by, changed_at, reverted_at, reverted_by, revert_reason, changed_by_user:users!conciliacao_recibo_changes_changed_by_fkey(nome_completo, email), reverted_by_user:users!conciliacao_recibo_changes_reverted_by_fkey(nome_completo, email)"
      )
      .eq("company_id", companyId)
      .order("changed_at", { ascending: false })
      .limit(500);

    if (somentePendentes) query = query.is("reverted_at", null);

    const { data, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify(data || []), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=5",
        Vary: "Cookie",
      },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/changes", err);
    return new Response(err?.message || "Erro ao listar alteracoes.", { status: 500 });
  }
};
