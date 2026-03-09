import { buildAuthClient, getUserScope, requireModuloLevel } from "../vendas/_utils";

function normalizeTerm(value?: string | null) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function buildJsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=10",
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
        ["operacao_documentos_viagens"],
        1,
        "Sem acesso a Documentos Viagens."
      );
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const busca = normalizeTerm(url.searchParams.get("busca"));

    let query = client
      .from("documentos_viagens")
      .select(
        "id, company_id, uploaded_by, file_name, display_name, title, template_text, template_fields, storage_bucket, storage_path, mime_type, size_bytes, created_at, updated_at, uploader:uploaded_by(id, nome_completo, email)"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (busca) {
      const term = busca.replace(/%/g, "");
      query = query.or(`file_name.ilike.%${term}%,display_name.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return buildJsonResponse({ items: data || [] });
  } catch (err) {
    console.error("Erro documentos-viagens/list", err);
    return new Response("Erro ao listar documentos.", { status: 500 });
  }
}
