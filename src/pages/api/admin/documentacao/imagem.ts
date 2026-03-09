import { createServerClient, supabaseServer } from "../../../../lib/supabaseServer";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
const BUCKET = "system-docs";
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

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
      return new Response("Apenas administradores podem enviar imagens.", { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file || typeof file.arrayBuffer !== "function") {
      return new Response("Arquivo inválido.", { status: 400 });
    }
    if (!file.type || !file.type.startsWith("image/")) {
      return new Response("Somente imagens são permitidas.", { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return new Response("Imagem excede o limite de 5MB.", { status: 413 });
    }

    const safeName = sanitizeFileName(file.name || "imagem.png");
    const ext = safeName.includes(".") ? safeName.split(".").pop() : file.type.split("/")[1];
    const finalName = safeName.includes(".") ? safeName : `imagem.${ext || "png"}`;
    const path = `docs/${Date.now()}-${finalName}`;
    const buffer = new Uint8Array(await file.arrayBuffer());

    const { error: uploadErr } = await supabaseServer.storage
      .from(BUCKET)
      .upload(path, buffer, {
        contentType: file.type || "image/png",
        upsert: false,
        cacheControl: "3600",
      });

    if (uploadErr) {
      return new Response(`Falha ao enviar imagem: ${uploadErr.message}`, { status: 500 });
    }

    const { data } = supabaseServer.storage.from(BUCKET).getPublicUrl(path);
    return new Response(JSON.stringify({ url: data?.publicUrl || "", path, name: finalName }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
