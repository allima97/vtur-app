import type { APIRoute } from "astro";
import {
  buildAuthClient,
  getUserScope,
  requireModuloLevel,
  resolveCompanyId,
} from "../vendas/_utils";
import { reconcilePendentes } from "./_reconcile";

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
      limit?: number | null;
    } | null;

    const companyId = resolveCompanyId(scope, body?.companyId || null);
    if (!companyId) return new Response("Company invalida.", { status: 400 });

    const limit = Math.max(1, Math.min(500, Number(body?.limit || 200)));

    const result = await reconcilePendentes({
      companyId,
      limit,
      actor: "user",
      actorUserId: user.id,
    });

    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro conciliacao/run", err);
    return new Response(err?.message || "Erro ao conciliar pendentes.", { status: 500 });
  }
};
