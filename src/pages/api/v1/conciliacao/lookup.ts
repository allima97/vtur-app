import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import { findReciboByNumero } from "./_reconcile";

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
        1,
        "Sem acesso a Conciliação."
      );
      if (denied) return denied;
    }

    const body = (await request.json()) as {
      companyId?: string | null;
      documentos?: Array<{
        documento: string;
        valor_lancamentos?: number | null;
        valor_taxas?: number | null;
      }> | null;
    };

    const companyId = resolveCompanyId(scope, body?.companyId || null);
    if (!companyId) return new Response("Company invalida.", { status: 400 });

    const documentos = Array.isArray(body?.documentos) ? body.documentos : [];
    if (documentos.length === 0) {
      return new Response(JSON.stringify({ matches: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const matches: Record<
      string,
      { vendedor_id: string; venda_id: string; venda_recibo_id: string } | null
    > = {};

    for (const item of documentos) {
      const documento = String(item?.documento || "").trim();
      if (!documento) continue;

      const found = await findReciboByNumero({
        numero: documento,
        companyId,
        valorLancamento: item.valor_lancamentos ?? null,
        valorTaxas: item.valor_taxas ?? null,
        client,
      });

      if (!found?.recibo?.vendedor_id) {
        matches[documento] = null;
        continue;
      }

      matches[documento] = {
        vendedor_id: found.recibo.vendedor_id,
        venda_id: found.recibo.venda_id,
        venda_recibo_id: found.recibo.id,
      };
    }

    return new Response(JSON.stringify({ matches }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/lookup", err);
    return new Response(err?.message || "Erro ao buscar vendedores.", { status: 500 });
  }
};
