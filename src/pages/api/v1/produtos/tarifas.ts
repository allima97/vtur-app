import { createServerClient } from "../../../../lib/supabaseServer";
import { MODULO_ALIASES } from "../../../../config/modulos";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

function permLevel(p?: string | null): number {
  switch (p) {
    case "admin":
      return 5;
    case "delete":
      return 4;
    case "edit":
      return 3;
    case "create":
      return 2;
    case "view":
      return 1;
    default:
      return 0;
  }
}

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

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

function toNumber(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

async function requireModuloView(client: any, userId: string, modulos: string[], msg: string) {
  const normalizeModulo = (value?: string | null) => {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    return MODULO_ALIASES[raw] || raw.replace(/\s+/g, "_");
  };

  const allowed = new Set<string>();
  modulos.forEach((modulo) => {
    const raw = String(modulo || "").trim().toLowerCase();
    if (!raw) return;
    allowed.add(raw);
    const normalized = normalizeModulo(raw);
    if (normalized) allowed.add(normalized);
  });

  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId);
  if (error) throw error;
  const podeVer = (acessos || []).some((row: any) => {
    if (!row?.ativo) return false;
    if (permLevel(row?.permissao as Permissao) < 1) return false;
    const moduloKey = normalizeModulo(row?.modulo);
    return moduloKey && allowed.has(moduloKey);
  });
  if (!podeVer) {
    return new Response(msg, { status: 403 });
  }
  return null;
}

async function requireModuloEdit(client: any, userId: string, modulos: string[], msg: string) {
  const normalizeModulo = (value?: string | null) => {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    return MODULO_ALIASES[raw] || raw.replace(/\s+/g, "_");
  };

  const allowed = new Set<string>();
  modulos.forEach((modulo) => {
    const raw = String(modulo || "").trim().toLowerCase();
    if (!raw) return;
    allowed.add(raw);
    const normalized = normalizeModulo(raw);
    if (normalized) allowed.add(normalized);
  });

  const { data: acessos, error } = await client
    .from("modulo_acesso")
    .select("modulo, permissao, ativo")
    .eq("usuario_id", userId);
  if (error) throw error;
  const podeEditar = (acessos || []).some((row: any) => {
    if (!row?.ativo) return false;
    if (permLevel(row?.permissao as Permissao) < 3) return false;
    const moduloKey = normalizeModulo(row?.modulo);
    return moduloKey && allowed.has(moduloKey);
  });
  if (!podeEditar) {
    return new Response(msg, { status: 403 });
  }
  return null;
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");

    if (!isAdmin) {
      const denied = await requireModuloView(
        client,
        user.id,
        ["cadastros_produtos", "cadastros"],
        "Sem acesso a Produtos."
      );
      if (denied) return denied;
    }

    const url = new URL(request.url);
    const produtoId = String(url.searchParams.get("produto_id") || "").trim();
    if (!isUuid(produtoId)) return new Response("produto_id invalido.", { status: 400 });

    const { data, error } = await client
      .from("produtos_tarifas")
      .select(
        "id, acomodacao, qte_pax, tipo, validade_de, validade_ate, valor_neto, padrao, margem, valor_venda, moeda, cambio, valor_em_reais"
      )
      .eq("produto_id", produtoId)
      .order("validade_de", { ascending: true });
    if (error) throw error;

    return new Response(JSON.stringify({ items: data || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro produtos/tarifas GET", err);
    return new Response("Erro ao carregar tarifas.", { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "").toUpperCase();
    const isAdmin = tipoName.includes("ADMIN");

    if (!isAdmin) {
      const denied = await requireModuloEdit(
        client,
        user.id,
        ["cadastros_produtos", "cadastros"],
        "Sem permissao para editar produtos."
      );
      if (denied) return denied;
    }

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const produtoId = String(body?.produto_id || "").trim();
    if (!isUuid(produtoId)) return new Response("produto_id invalido.", { status: 400 });

    const rawTarifas = Array.isArray(body?.tarifas) ? body.tarifas : [];
    const tarifas = rawTarifas
      .map((t: any) => {
        const acomodacao = String(t?.acomodacao || "").trim();
        const moeda = String(t?.moeda || "").trim() || "USD";
        const padrao = String(t?.padrao || "").trim() === "Manual" ? "Manual" : "Padrao";
        return {
          produto_id: produtoId,
          acomodacao,
          qte_pax: Math.max(0, Math.trunc(toNumber(t?.qte_pax, 0))),
          tipo: String(t?.tipo || "").trim(),
          validade_de: String(t?.validade_de || "").trim() || null,
          validade_ate: String(t?.validade_ate || "").trim() || null,
          valor_neto: toNumber(t?.valor_neto, 0),
          padrao,
          margem: toNullableNumber(t?.margem),
          valor_venda: toNumber(t?.valor_venda, 0),
          moeda,
          cambio: toNumber(t?.cambio, 1),
          valor_em_reais: toNumber(t?.valor_em_reais, 0),
        };
      })
      .slice(0, 400);

    const nomesAcomodacoes = Array.from(
      new Set(tarifas.map((t: any) => t.acomodacao).filter(Boolean))
    );

    const { error: deleteError } = await client
      .from("produtos_tarifas")
      .delete()
      .eq("produto_id", produtoId);
    if (deleteError) throw deleteError;

    if (tarifas.length) {
      const { error: insertError } = await client.from("produtos_tarifas").insert(tarifas);
      if (insertError) throw insertError;
    }

    if (nomesAcomodacoes.length) {
      const { error: acomodacoesError } = await client
        .from("acomodacoes")
        .upsert(nomesAcomodacoes.map((nome: string) => ({ nome })), { onConflict: "nome" });
      if (acomodacoesError) {
        console.error("Erro ao atualizar acomodacoes", acomodacoesError);
      }
    }

    return new Response(JSON.stringify({ ok: true, total: tarifas.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro produtos/tarifas POST", err);
    return new Response("Erro ao salvar tarifas.", { status: 500 });
  }
}
