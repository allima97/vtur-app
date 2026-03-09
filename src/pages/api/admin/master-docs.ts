import { supabaseServer, createServerClient } from "../../../lib/supabaseServer";

import { getSupabaseEnv } from "../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
const BUCKET = "master-docs";

function parseCookies(request: Request): Map<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const map = new Map<string, string>();
  header.split(";").forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const [rawName, ...rawValue] = trimmed.split("=");
    const name = rawName?.trim();
    if (!name) return;
    map.set(name, rawValue.join("=").trim());
  });
  return map;
}

function buildAuthClient(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("PUBLIC_SUPABASE_URL ou PUBLIC_SUPABASE_ANON_KEY não configurados.");
  }
  const cookies = parseCookies(request);
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (name: string) => cookies.get(name) ?? "",
      set: () => {},
      remove: () => {},
    },
  });
}

async function getUserFromRequest(request: Request) {
  const authClient = buildAuthClient(request);
  const { data, error } = await authClient.auth.getUser();
  if (error) {
    console.error("Não foi possível obter usuário da sessão", error);
    return null;
  }
  return data?.user ?? null;
}

async function isAdminUser(userId: string) {
  const { data, error } = await supabaseServer
    .from("users")
    .select("id, user_types(name)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  const tipo = String((data as any)?.user_types?.name || "").toUpperCase();
  return tipo.includes("ADMIN");
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST({ request }: { request: Request }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }
    const admin = await isAdminUser(user.id);
    if (!admin) {
      return new Response("Apenas administradores podem enviar documentos.", { status: 403 });
    }

    const form = await request.formData();
    const masterId = String(form.get("master_id") || "").trim();
    const docType = String(form.get("doc_type") || "").trim();
    const file = form.get("file") as File | null;

    if (!masterId || !docType || !file || typeof file.arrayBuffer !== "function") {
      return new Response("Dados obrigatórios ausentes.", { status: 400 });
    }

    const safeName = sanitizeFileName(file.name || "documento");
    const buffer = new Uint8Array(await file.arrayBuffer());
    const path = `master/${masterId}/${Date.now()}-${safeName}`;

    const { data: uploadData, error: uploadErr } = await supabaseServer.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      return new Response(`Falha ao enviar arquivo: ${uploadErr.message}`, { status: 500 });
    }

    const { data: docRow, error: insertErr } = await supabaseServer
      .from("master_documents")
      .insert({
        master_id: masterId,
        uploaded_by: user.id,
        doc_type: docType,
        file_name: file.name || safeName,
        storage_bucket: BUCKET,
        storage_path: uploadData?.path || path,
        mime_type: file.type || null,
        size_bytes: file.size || null,
      })
      .select("id")
      .single();

    if (insertErr) {
      return new Response(`Falha ao salvar documento: ${insertErr.message}`, { status: 500 });
    }

    return new Response(JSON.stringify({ id: docRow?.id, path: uploadData?.path || path }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
