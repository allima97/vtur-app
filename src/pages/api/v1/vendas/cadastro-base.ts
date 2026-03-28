import { createServerClient } from "../../../../lib/supabaseServer";
import { MODULO_ALIASES } from "../../../../config/modulos";
import { kvCache } from "../../../../lib/kvCache";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type CacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const CACHE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map<string, CacheEntry>();

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

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

function resolvePapel(tipoNome: string, usoIndividual: boolean): Papel {
  if (usoIndividual) return "VENDEDOR";
  const tipo = String(tipoNome || "").toUpperCase();
  if (tipo.includes("ADMIN")) return "ADMIN";
  if (tipo.includes("MASTER")) return "MASTER";
  if (tipo.includes("GESTOR")) return "GESTOR";
  if (tipo.includes("VENDEDOR")) return "VENDEDOR";
  return "OUTRO";
}

function isAllowedSellerTipo(tipoNome?: string | null) {
  const tipo = String(tipoNome || "").toUpperCase();
  return tipo.includes("VENDEDOR") || tipo.includes("GESTOR") || tipo.includes("MASTER");
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

async function fetchGestorEquipeIdsComGestor(client: any, gestorId: string) {
  if (!gestorId) return [gestorId].filter(Boolean);
  try {
    const { data, error } = await client.rpc("gestor_equipe_vendedor_ids", { uid: gestorId });
    if (error) throw error;
    const ids =
      (data || [])
        .map((row: any) => String(row?.vendedor_id || "").trim())
        .filter(Boolean) || [];
    return Array.from(new Set([gestorId, ...ids]));
  } catch {
    return [gestorId];
  }
}

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const url = new URL(request.url);
    const noCache = String(url.searchParams.get("no_cache") || "").trim() === "1";

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("id, nome_completo, company_id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const tipoName = String((perfil as any)?.user_types?.name || "");
    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    const companyId = (perfil as any)?.company_id || null;
    const papel = resolvePapel(tipoName, usoIndividual);

    if (papel !== "ADMIN") {
      const denied = await requireModuloView(
        client,
        user.id,
        ["vendas", "vendas_cadastro"],
        "Sem acesso a Vendas."
      );
      if (denied) return denied;
    }

    const cacheKey = ["v1", "vendas", "cadastro-base", user.id].join("|");

    if (!noCache) {
      const kvCached = await kvCache.get<any>(cacheKey);
      if (kvCached) {
        return new Response(JSON.stringify(kvCached), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "private, max-age=10",
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
            "Cache-Control": "private, max-age=10",
            Vary: "Cookie",
          },
        });
      }
    }

    const canAssignVendedor = !usoIndividual && (papel === "GESTOR" || papel === "MASTER");
    let vendedoresEquipe: { id: string; nome_completo: string | null }[] = [];
    if (papel === "GESTOR" && companyId) {
      // IDs da equipe do gestor (via RPC) + todos os gestores da mesma empresa
      const equipeIds = await fetchGestorEquipeIdsComGestor(client, user.id);

      const { data: gestoresData } = await client
        .from("users")
        .select("id, user_types(name)")
        .eq("company_id", companyId)
        .eq("uso_individual", false)
        .eq("active", true);

      const gestoresIds = ((gestoresData || []) as any[])
        .filter((row) => isAllowedSellerTipo(row?.user_types?.name))
        .map((row) => String(row?.id || "").trim())
        .filter(Boolean);

      const allIds = Array.from(new Set([...equipeIds, ...gestoresIds]));

      const { data: vendedoresData, error: vendErr } = await client
        .from("users")
        .select("id, nome_completo, user_types(name)")
        .in("id", allIds)
        .eq("active", true)
        .order("nome_completo");
      if (vendErr) throw vendErr;
      vendedoresEquipe = ((vendedoresData || []) as any[]).filter((row) =>
        isAllowedSellerTipo(row?.user_types?.name)
      );
    } else if (papel === "MASTER" && companyId) {
      const { data: vendedoresData, error: vendErr } = await client
        .from("users")
        .select("id, nome_completo, user_types(name)")
        .eq("company_id", companyId)
        .eq("uso_individual", false)
        .eq("active", true)
        .order("nome_completo");
      if (vendErr) throw vendErr;
      vendedoresEquipe = ((vendedoresData || []) as any[]).filter((row) =>
        isAllowedSellerTipo(row?.user_types?.name)
      );
    } else {
      vendedoresEquipe = [
        {
          id: user.id,
          nome_completo: (perfil as any)?.nome_completo || "Você",
        },
      ];
    }

    const [c, d, p, tiposResp, pacotesResp, formasResp] = await Promise.all([
      client.rpc("vendas_clientes_base"),
      client.from("cidades").select("id, nome").order("nome"),
      client
        .from("produtos")
        .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
        .order("nome"),
      client.from("tipo_produtos").select("id, nome, tipo").order("nome"),
      client.from("tipo_pacotes").select("id, nome, ativo").order("nome"),
      client
        .from("formas_pagamento")
        .select("id, nome, paga_comissao, permite_desconto, desconto_padrao_pct, ativo")
        .order("nome"),
    ]);

    if (c.error) throw c.error;
    if (d.error) throw d.error;
    if (p.error) throw p.error;
    if (tiposResp.error) throw tiposResp.error;
    if (pacotesResp.error) throw pacotesResp.error;
    if (formasResp.error) throw formasResp.error;

    const clientesBase = Array.isArray(c.data) ? (c.data as any[]) : [];
    let clientesDetalhados: any[] = clientesBase;

    if (clientesBase.length > 0) {
      try {
        const ids = Array.from(
          new Set(
            clientesBase
              .map((row: any) => String(row?.id || "").trim())
              .filter(Boolean)
          )
        );
        if (ids.length > 0) {
          const { data: contatosData, error: contatosErr } = await client
            .from("clientes")
            .select("id, telefone, email, whatsapp")
            .in("id", ids);
          if (contatosErr) {
            console.warn("[vendas/cadastro-base] sem contatos de clientes:", contatosErr.message);
          } else {
            const contatoById = new Map<string, any>();
            (contatosData || []).forEach((row: any) => {
              const id = String(row?.id || "").trim();
              if (!id) return;
              contatoById.set(id, row);
            });
            clientesDetalhados = clientesBase.map((row: any) => {
              const id = String(row?.id || "").trim();
              const contato = contatoById.get(id) || {};
              return {
                ...row,
                telefone: contato?.telefone ?? null,
                email: contato?.email ?? null,
                whatsapp: contato?.whatsapp ?? null,
              };
            });
          }
        }
      } catch (err) {
        console.warn("[vendas/cadastro-base] falha ao enriquecer clientes:", err);
      }
    }

    const payload = {
      user: {
        id: user.id,
        papel,
        company_id: companyId,
        uso_individual: usoIndividual,
        is_gestor: papel === "GESTOR",
        can_assign_vendedor: canAssignVendedor,
      },
      vendedoresEquipe,
      clientes: clientesDetalhados,
      cidades: d.data || [],
      produtos: (p.data || []).map((prod: any) => ({
        ...prod,
        todas_as_cidades: prod?.todas_as_cidades ?? false,
      })),
      tipos: tiposResp.data || [],
      tiposPacote: (pacotesResp.data || []).filter((tp: any) => tp?.ativo !== false),
      formasPagamento: (formasResp.data || []).filter((fp: any) => fp?.ativo !== false),
    };

    writeCache(cacheKey, payload);
    await kvCache.set(cacheKey, payload, 10);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=10",
        Vary: "Cookie",
      },
    });
  } catch (err) {
    console.error("Erro vendas/cadastro-base", err);
    return new Response("Erro ao carregar base de vendas.", { status: 500 });
  }
}
