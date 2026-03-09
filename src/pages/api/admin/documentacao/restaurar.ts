import { createServerClient, supabaseServer } from "../../../../lib/supabaseServer";
import { DOC_PRIMARY_SLUG, DOC_SLUGS } from "../../../../lib/systemName";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

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

export async function POST({ request }: { request: Request }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }
    const admin = await isAdminUser(user.id);
    if (!admin) {
      return new Response("Apenas administradores podem restaurar versões.", { status: 403 });
    }

    const body = await request.json();
    const versionId = String(body?.id || "").trim();
    if (!versionId) {
      return new Response("Versão inválida.", { status: 400 });
    }

    const { data: version, error: versionErr } = await supabaseServer
      .from("system_documentation_versions")
      .select("id, markdown, slug")
      .eq("id", versionId)
      .maybeSingle();
    if (versionErr) throw versionErr;
    if (!version) {
      return new Response("Versão não encontrada.", { status: 404 });
    }
    if (!DOC_SLUGS.includes(String(version.slug) as (typeof DOC_SLUGS)[number])) {
      return new Response("Versão inválida para esta documentação.", { status: 400 });
    }

    const content = String(version.markdown || "").trim();
    if (!content) {
      return new Response("Conteúdo da versão vazio.", { status: 400 });
    }

    const finalContent = content.endsWith("\n") ? content : `${content}\n`;
    const { error } = await supabaseServer
      .from("system_documentation")
      .upsert(
        {
          slug: DOC_PRIMARY_SLUG,
          markdown: finalContent,
          updated_at: new Date().toISOString(),
          updated_by: user.id,
        },
        { onConflict: "slug" }
      );
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, markdown: finalContent }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
