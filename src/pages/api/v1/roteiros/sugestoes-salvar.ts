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

    // Verifica duplicata (case-insensitive)
    const { data: existing } = await client
      .from("roteiro_sugestoes")
      .select("id, uso_count")
      .eq("company_id", companyId)
      .eq("tipo", tipo)
      .ilike("valor", valor)
      .maybeSingle();

    if (existing) {
      // Já existe – incrementa contagem de uso
      await client
        .from("roteiro_sugestoes")
        .update({
          uso_count: (existing.uso_count || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      return new Response(JSON.stringify({ ok: true, novo: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Insere novo
    const { error } = await client.from("roteiro_sugestoes").insert({
      company_id: companyId,
      tipo,
      valor,
      uso_count: 1,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, novo: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro roteiros/sugestoes-salvar", err);
    return new Response(err?.message || "Erro ao salvar sugestao.", { status: 500 });
  }
}
