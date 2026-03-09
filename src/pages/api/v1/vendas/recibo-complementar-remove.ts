import { buildAuthClient, getUserScope, requireModuloLevel } from "./_utils";

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
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
        ["vendas_consulta", "vendas"],
        3,
        "Sem permissao para editar vendas."
      );
      if (denied) return denied;
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const ids = Array.isArray(body?.ids) ? body.ids : [];
    const idsLista = ids.map((id: any) => String(id || "").trim()).filter(Boolean).slice(0, 50);
    if (!idsLista.length) return new Response("ids obrigatorio.", { status: 400 });

    const { error } = await client.from("vendas_recibos_complementares").delete().in("id", idsLista);
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, removed: idsLista.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro vendas/recibo-complementar-remove", err);
    return new Response("Erro ao remover recibo complementar.", { status: 500 });
  }
}
