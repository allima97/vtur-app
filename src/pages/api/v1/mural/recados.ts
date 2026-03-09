import { createServerClient } from "../../../../lib/supabaseServer";
import { kvCache } from "../../../../lib/kvCache";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 5_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

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
    throw new Error("PUBLIC_SUPABASE_URL ou PUBLIC_SUPABASE_ANON_KEY nao configurados.");
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

function readCache(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.payload;
}

function writeCache(key: string, payload: unknown) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload });
}

async function fetchRecados(client: any, companyId: string) {
  const baseSelect =
    "id, company_id, sender_id, receiver_id, assunto, conteudo, created_at, sender_deleted, receiver_deleted, sender:sender_id(id, nome_completo, email), receiver:receiver_id(id, nome_completo, email), leituras:mural_recados_leituras(read_at, user_id, user:user_id(id, nome_completo, email))";
  const selectWithAttachments = `${baseSelect}, arquivos:mural_recados_arquivos(id, company_id, recado_id, uploaded_by, file_name, storage_bucket, storage_path, mime_type, size_bytes, created_at)`;

  const fetchRows = async (select: string) =>
    client
      .from("mural_recados")
      .select(select)
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100);

  let supportsAttachments = true;
  let resp = await fetchRows(selectWithAttachments);
  if (resp.error) {
    const msg = String(resp.error.message || "").toLowerCase();
    if (msg.includes("mural_recados_arquivos")) {
      supportsAttachments = false;
      resp = await fetchRows(baseSelect);
    }
  }
  if (resp.error) throw resp.error;

  return { recados: resp.data || [], supportsAttachments };
}

async function assertCompanyAccess(client: any, userId: string, companyId: string) {
  const { data: perfil, error: perfilErr } = await client
    .from("users")
    .select("company_id, user_types(name)")
    .eq("id", userId)
    .maybeSingle();
  if (perfilErr) throw perfilErr;

  const userTypeName = String((perfil as any)?.user_types?.name || "");
  const isMaster = /MASTER/i.test(userTypeName);
  const profileCompanyId = String((perfil as any)?.company_id || "").trim();

  if (!isMaster) {
    if (!profileCompanyId || profileCompanyId !== companyId) {
      return new Response("Sem acesso a empresa.", { status: 403 });
    }
    return null;
  }

  const { data: vinculos, error: vincErr } = await client
    .from("master_empresas")
    .select("company_id, status")
    .eq("master_id", userId)
    .eq("status", "approved");
  if (vincErr) throw vincErr;

  const allowed = (vinculos || []).some((row: any) => String(row.company_id || "") === companyId);
  if (!allowed) {
    return new Response("Sem acesso a empresa.", { status: 403 });
  }
  return null;
}

export async function GET({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const companyId = String(url.searchParams.get("company_id") || "").trim();
    if (!companyId) return new Response("company_id obrigatorio.", { status: 400 });

    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const denied = await assertCompanyAccess(client, user.id, companyId);
    if (denied) return denied;

    const cacheKey = ["v1", "muralRecados", user.id, companyId].join("|");
    const kvCached = await kvCache.get<any>(cacheKey);
    if (kvCached) {
      return new Response(JSON.stringify(kvCached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=5",
          Vary: "Cookie",
        },
      });
    }

    const cached = readCache(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=5",
          Vary: "Cookie",
        },
      });
    }

    const recadosResp = await fetchRecados(client, companyId);
    const payload = {
      recados: recadosResp.recados,
      supportsAttachments: recadosResp.supportsAttachments,
    };

    writeCache(cacheKey, payload);
    await kvCache.set(cacheKey, payload, 5);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=5",
        Vary: "Cookie",
      },
    });
  } catch (e: any) {
    console.error("Erro mural recados:", e);
    return new Response("Erro ao carregar recados.", { status: 500 });
  }
}
