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

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const companyId = await resolveCompanyId(client, user.id);

    const url = new URL(request.url);
    const tipo = url.searchParams.get("tipo") || null;
    const q = url.searchParams.get("q") || "";

    let query = client
      .from("roteiro_sugestoes")
      .select("tipo, valor")
      .order("uso_count", { ascending: false })
      .limit(200);

    if (companyId) {
      query = query.eq("company_id", companyId);
    } else {
      query = query.is("company_id", null);
    }

    if (tipo) query = query.eq("tipo", tipo);
    if (q) query = query.ilike("valor", `%${q}%`);

    const { data, error } = await query;
    if (error) throw error;

    // Agrupa por tipo
    const sugestoes: Record<string, string[]> = {};
    (data || []).forEach((row: any) => {
      if (!sugestoes[row.tipo]) sugestoes[row.tipo] = [];
      sugestoes[row.tipo].push(row.valor);
    });

    return new Response(JSON.stringify({ sugestoes }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro roteiros/sugestoes-busca", err);
    return new Response("Erro ao buscar sugestoes.", { status: 500 });
  }
}
