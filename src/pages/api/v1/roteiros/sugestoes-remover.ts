import { buildAuthClient } from "../vendas/_utils";

async function resolveCompanyId(client: any, userId: string): Promise<string | null> {
  const { data, error } = await client
    .from("users")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return String((data as any)?.company_id || "").trim() || null;
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const body = await request.json().catch(() => null);
    if (!body || !body.tipo || !body.valor) {
      return new Response("Dados invalidos.", { status: 400 });
    }

    const tipo = String(body.tipo).trim();
    const valor = String(body.valor).trim();
    if (!tipo || !valor) return new Response("Dados invalidos.", { status: 400 });

    const companyId = await resolveCompanyId(client, user.id);

    let query = client
      .from("roteiro_sugestoes")
      .delete()
      .eq("tipo", tipo)
      .ilike("valor", valor);

    if (companyId) {
      query = query.eq("company_id", companyId);
    } else {
      query = query.is("company_id", null);
    }

    const { error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro roteiros/sugestoes-remover", err);
    return new Response(err?.message || "Erro ao remover sugestao.", { status: 500 });
  }
}

