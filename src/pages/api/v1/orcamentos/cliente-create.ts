import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";

async function resolveCompanyId(client: any, userId: string) {
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

    const denied = await requireModuloLevel(
      client,
      user.id,
      ["orcamentos", "vendas"],
      2,
      "Sem acesso para criar Orcamentos."
    );
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const nome = String(body?.nome || "").trim();
    const telefone = String(body?.telefone || "").trim();
    if (!nome || !telefone) return new Response("Nome e telefone obrigatorios.", { status: 400 });

    const companyId = await resolveCompanyId(client, user.id);
    const payload: Record<string, any> = {
      nome,
      telefone,
      whatsapp: telefone,
      ativo: true,
      active: true,
    };
    if (companyId) payload.company_id = companyId;

    const { data, error } = await client
      .from("clientes")
      .insert(payload)
      .select("id, nome, cpf, whatsapp, email")
      .single();
    if (error || !data) throw error || new Error("Falha ao criar cliente.");

    return new Response(JSON.stringify({ item: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro orcamentos/cliente-create", err);
    return new Response("Erro ao criar cliente.", { status: 500 });
  }
}
