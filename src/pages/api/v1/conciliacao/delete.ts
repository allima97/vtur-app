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
        "Sem permissao para excluir registros da Conciliação."
      );
      if (denied) return denied;
    }

    const body = (await request.json().catch(() => null)) as {
      companyId?: string | null;
      conciliacaoId?: string | null;
    } | null;

    const companyId = resolveCompanyId(scope, body?.companyId || null);
    if (!companyId) return new Response("Company invalida.", { status: 400 });

    const conciliacaoId = String(body?.conciliacaoId || "").trim();
    if (!isUuid(conciliacaoId)) {
      return new Response("Registro de conciliacao invalido.", { status: 400 });
    }

    const { data: registro, error: registroErr } = await client
      .from("conciliacao_recibos")
      .select("id, company_id, conciliado")
      .eq("id", conciliacaoId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (registroErr) throw registroErr;
    if (!registro) return new Response("Registro nao encontrado.", { status: 404 });
    if (registro.conciliado) {
      return new Response("Nao e permitido excluir um recibo ja conciliado.", { status: 409 });
    }

    const { error: changesErr } = await client
      .from("conciliacao_recibo_changes")
      .delete()
      .eq("company_id", companyId)
      .eq("conciliacao_recibo_id", conciliacaoId);
    if (changesErr) throw changesErr;

    const { error: deleteErr } = await client
      .from("conciliacao_recibos")
      .delete()
      .eq("id", conciliacaoId)
      .eq("company_id", companyId)
      .eq("conciliado", false);
    if (deleteErr) throw deleteErr;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/delete", err);
    return new Response(err?.message || "Erro ao excluir registro da conciliacao.", { status: 500 });
  }
};
