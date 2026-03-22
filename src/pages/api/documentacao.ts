import { createServerClient } from "../../lib/supabaseServer";
import {
  buildDocumentationMarkdownFromSections,
  parseLegacyDocumentationSections,
} from "../../lib/documentation";
import { fetchDocumentationSections } from "../../lib/documentationServer";
import { DOC_FALLBACK_PATHS, DOC_SLUGS } from "../../lib/systemName";

import { getSupabaseEnv } from "./users";
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

async function fetchFallbackMarkdown(request: Request) {
  let lastStatus = 0;
  for (const path of DOC_FALLBACK_PATHS) {
    const url = new URL(path, request.url);
    const res = await fetch(url, {
      headers: {
        cookie: request.headers.get("cookie") ?? "",
      },
      cache: "no-store",
    });
    if (res.ok) {
      return res.text();
    }
    lastStatus = res.status;
  }
  throw new Error(`Falha ao carregar fallback (${lastStatus || 404}).`);
}

export async function GET({ request }: { request: Request }) {
  try {
    const authClient = buildAuthClient(request);
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }

    try {
      const sections = await fetchDocumentationSections(authClient, DOC_SLUGS);
      if (sections.length > 0) {
        return new Response(JSON.stringify({ markdown: buildDocumentationMarkdownFromSections(sections), sections, source: "sections" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      }
    } catch (err) {
      console.warn("[documentacao] Falha ao ler system_documentation_sections.", err);
    }

    try {
      const { data, error } = await authClient
        .from("system_documentation")
        .select("slug, markdown, updated_at")
        .in("slug", [...DOC_SLUGS])
        .order("updated_at", { ascending: false })
        .limit(1);
      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : null;
      if (row?.markdown) {
        return new Response(JSON.stringify({ markdown: row.markdown, sections: parseLegacyDocumentationSections(row.markdown, row.slug || "vtur"), source: "legacy" }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
        });
      }
    } catch (err) {
      console.warn("[documentacao] Falha ao ler system_documentation.", err);
    }

    const fallback = await fetchFallbackMarkdown(request);
    return new Response(JSON.stringify({ markdown: fallback, sections: parseLegacyDocumentationSections(fallback), source: "fallback" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
