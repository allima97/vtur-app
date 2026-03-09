import { buildAuthClient, getUserScope, requireModuloLevel, isUuid } from "../vendas/_utils";

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clampText(value: unknown, max = 120_000) {
  const s = String(value ?? "");
  if (s.length <= max) return s;
  return s.slice(0, max);
}

function normalizeTitle(value: unknown) {
  return clampText(value, 160).trim().replace(/\s+/g, " ");
}

type TemplateField = {
  key: string;
  label: string;
  type: "text" | "date" | "signature";
};

function normalizeFields(raw: unknown): TemplateField[] {
  if (!Array.isArray(raw)) return [];
  const out: TemplateField[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const key = String((item as any)?.key || "")
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 64);
    if (!key || seen.has(key)) continue;
    const typeRaw = String((item as any)?.type || "text");
    const type: TemplateField["type"] =
      typeRaw === "date" || typeRaw === "signature" ? typeRaw : "text";
    const label = String((item as any)?.label || key)
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 80);
    seen.add(key);
    out.push({ key, label: label || key, type });
  }
  return out.slice(0, 80);
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
        3,
        "Sem permissão para editar documentos."
      );
      if (denied) return denied;
    }

    const body = safeJsonParse(await request.text()) as any;
    const id = String(body?.id || "").trim();
    if (!isUuid(id)) return new Response("id invalido.", { status: 400 });

    const title = normalizeTitle(body?.title);
    const templateText = clampText(body?.template_text, 200_000);
    const templateFields = normalizeFields(body?.template_fields);

    if (!title) return new Response("title obrigatorio.", { status: 400 });
    if (!templateText.trim()) return new Response("template_text obrigatorio.", { status: 400 });

    const { data, error } = await client
      .from("documentos_viagens")
      .update({
        title,
        template_text: templateText,
        template_fields: templateFields as any,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq("id", id)
      .select(
        "id, file_name, display_name, title, template_text, template_fields, storage_bucket, storage_path, mime_type, size_bytes, created_at, updated_at"
      )
      .maybeSingle();
    if (error) throw error;

    if (!data) return new Response("Documento não encontrado.", { status: 404 });

    return new Response(JSON.stringify({ ok: true, doc: data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro documentos-viagens/save-template", err);
    return new Response("Erro ao salvar modelo.", { status: 500 });
  }
}
