import { buildAuthClient, getUserScope, requireModuloLevel } from "../vendas/_utils";

function buildJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=30",
      Vary: "Cookie",
    },
  });
}

export async function GET({ request }: { request: Request }) {
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
        ["operacao_preferencias"],
        1,
        "Sem acesso a Minhas Preferências."
      );
      if (denied) return denied;
    }

    const companyId = scope.companyId;
    if (!companyId) return buildJsonResponse({ tipos: [], usuarios: [] });

    const [tiposResp, usuariosResp] = await Promise.all([
      client.from("tipo_produtos").select("id, nome, tipo").order("nome").limit(500),
      client
        .from("users")
        .select("id, nome_completo, email, active")
        .eq("company_id", companyId)
        .eq("active", true)
        .order("nome_completo"),
    ]);

    if (tiposResp.error) throw tiposResp.error;
    if (usuariosResp.error) throw usuariosResp.error;

    const usuarios = (usuariosResp.data || [])
      .map((row: any) => ({
        id: String(row?.id || ""),
        nome_completo: String(row?.nome_completo || ""),
        email: String(row?.email || ""),
      }))
      .filter((u: any) => u.id && u.id !== user.id);

    return buildJsonResponse({
      tipos: tiposResp.data || [],
      usuarios,
    });
  } catch (err) {
    console.error("Erro preferencias/base", err);
    return new Response("Erro ao carregar base.", { status: 500 });
  }
}
