import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";

async function resolveCompanyId(client: any, userId: string): Promise<string | null> {
  const { data, error } = await client
    .from("users")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return String((data as any)?.company_id || "").trim() || null;
}

function isMissingPercursoColumn(error: any) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return (
    code === "42703" ||
    (/percurso/i.test(msg) && /does not exist|nao existe|não existe|unknown column|column/i.test(msg))
  );
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const denied = await requireModuloLevel(
      client,
      user.id,
      ["orcamentos", "vendas"],
      1,
      "Sem acesso a Roteiros."
    );
    if (denied) return denied;

    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";
    const cidade = url.searchParams.get("cidade") || "";

    const companyId = await resolveCompanyId(client, user.id);

    const runQuery = async (withPercurso: boolean) => {
      let query = client
        .from("roteiro_dia")
        .select(withPercurso ? "id, percurso, cidade, descricao, data, roteiro_id" : "id, cidade, descricao, data, roteiro_id")
        .order("created_at", { ascending: false })
        .limit(20);

      if (companyId) {
        query = query.eq("company_id", companyId);
      } else {
        query = query.eq("created_by", user.id);
      }

      if (cidade) {
        query = query.ilike("cidade", `%${cidade}%`);
      }

      if (q) {
        if (withPercurso) {
          // busca simples em descrição e percurso
          query = query.or(`descricao.ilike.%${q}%,percurso.ilike.%${q}%`);
        } else {
          query = query.ilike("descricao", `%${q}%`);
        }
      }

      return await query;
    };

    let data: any[] | null = null;
    let error: any = null;

    const res1 = await runQuery(true);
    data = (res1 as any).data;
    error = (res1 as any).error;

    if (error && isMissingPercursoColumn(error)) {
      const res2 = await runQuery(false);
      data = (res2 as any).data;
      error = (res2 as any).error;
    }

    if (error) throw error;

    return new Response(JSON.stringify({ dias: data || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro roteiros/dias-busca", err);
    return new Response("Erro ao buscar dias.", { status: 500 });
  }
}
