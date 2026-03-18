import { buildAuthClient } from "../vendas/_utils";

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const { data: userRow, error: userErr } = await client
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (userErr) throw userErr;

    const companyId = String((userRow as any)?.company_id || "").trim() || null;
    if (!companyId) {
      return new Response(JSON.stringify({ required: false, company_id: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data, error } = await client
      .from("parametros_comissao")
      .select("mfa_obrigatorio")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;

    return new Response(
      JSON.stringify({
        required: Boolean((data as any)?.mfa_obrigatorio),
        company_id: companyId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Erro auth/mfa-policy", err);
    return new Response("Erro ao carregar politica de MFA.", { status: 500 });
  }
}
