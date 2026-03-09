import { buildAuthClient, getUserScope, requireModuloLevel } from "../vendas/_utils";

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function sanitizeFileName(name: string) {
  const base = String(name || "").trim();
  if (!base) return "arquivo";
  return base
    .replace(/\s+/g, " ")
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._ -]/g, "")
    .slice(0, 120)
    .trim();
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
        ["operacao_documentos_viagens"],
        2,
        "Sem permissão para enviar documentos."
      );
      if (denied) return denied;
    }

    const companyId = scope.companyId;
    if (!companyId) return new Response("Empresa inválida.", { status: 400 });

    const body = safeJsonParse(await request.text()) as any;

    const rawFileName = String(body?.file_name || "").trim();
    if (!rawFileName) return new Response("file_name obrigatorio.", { status: 400 });

    const fileName = sanitizeFileName(rawFileName);
    const displayName = String(body?.display_name || "").trim() || fileName;

    const mimeType = String(body?.mime_type || "").trim() || null;
    const sizeBytesRaw = Number(body?.size_bytes);
    const sizeBytes = Number.isFinite(sizeBytesRaw) ? Math.max(0, Math.trunc(sizeBytesRaw)) : null;

    const uuid =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const storageBucket = "viagens-documentos";
    const storagePath = `${companyId}/${uuid}-${fileName}`;

    const { data, error } = await client
      .from("documentos_viagens")
      .insert({
        company_id: companyId,
        uploaded_by: user.id,
        file_name: fileName,
        display_name: displayName,
        storage_bucket: storageBucket,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: sizeBytes,
      })
      .select(
        "id, company_id, uploaded_by, file_name, display_name, storage_bucket, storage_path, mime_type, size_bytes, created_at"
      )
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, doc: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro documentos-viagens/create", err);
    return new Response("Erro ao preparar upload.", { status: 500 });
  }
}
