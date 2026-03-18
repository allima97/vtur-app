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
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") || 20)));

    const { data, error } = await client
      .from("conciliacao_execucoes")
      .select("id, company_id, actor, actor_user_id, checked, reconciled, updated_taxes, still_pending, status, error_message, created_at, actor_user:actor_user_id(nome_completo, email)")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    return new Response(JSON.stringify(Array.isArray(data) ? data : []), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=5",
        Vary: "Cookie",
      },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/executions", err);
    return new Response(err?.message || "Erro ao carregar execucoes da conciliacao.", { status: 500 });
  }
};
