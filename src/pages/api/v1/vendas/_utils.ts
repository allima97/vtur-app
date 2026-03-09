import { createServerClient } from "../../../../lib/supabaseServer";
import { MODULO_ALIASES } from "../../../../config/modulos";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

export type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";

export type Permissao = "none" | "view" | "create" | "edit" | "delete" | "admin";

export type UserScope = {
  userId: string;
  papel: Papel;
  usoIndividual: boolean;
  companyId: string | null;
  isAdmin: boolean;
};

export function permLevel(p?: string | null): number {
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

export function resolvePapel(tipoNome: string, usoIndividual: boolean): Papel {
  if (usoIndividual) return "VENDEDOR";
  const tipo = String(tipoNome || "").toUpperCase();
  if (tipo.includes("ADMIN")) return "ADMIN";
  if (tipo.includes("MASTER")) return "MASTER";
  if (tipo.includes("GESTOR")) return "GESTOR";
  if (tipo.includes("VENDEDOR")) return "VENDEDOR";
  return "OUTRO";
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

export function buildAuthClient(request: Request) {
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

export async function getUserScope(client: any, userId: string): Promise<UserScope> {
  const { data: perfil, error: perfilErr } = await client
    .from("users")
    .select("id, company_id, uso_individual, user_types(name)")
    .eq("id", userId)
    .maybeSingle();
  if (perfilErr) throw perfilErr;

  const tipoName = String((perfil as any)?.user_types?.name || "");
  const usoIndividual = Boolean((perfil as any)?.uso_individual);
  const papel = resolvePapel(tipoName, usoIndividual);
  const companyId = String((perfil as any)?.company_id || "").trim() || null;
  const isAdmin = String(tipoName || "").toUpperCase().includes("ADMIN");

  return { userId, papel, usoIndividual, companyId, isAdmin };
}

export async function requireModuloLevel(
  client: any,
  userId: string,
  modulos: string[],
  minLevel: number,
  msg: string
) {
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
  const hasAccess = (acessos || []).some((row: any) => {
    if (!row?.ativo) return false;
    if (permLevel(row?.permissao as Permissao) < minLevel) return false;
    const moduloKey = normalizeModulo(row?.modulo);
    return moduloKey && allowed.has(moduloKey);
  });
  if (!hasAccess) return new Response(msg, { status: 403 });
  return null;
}

export function resolveCompanyId(scope: UserScope, requestedCompanyId?: string | null) {
  const requested = String(requestedCompanyId || "").trim();
  if (scope.papel === "MASTER" && requested && requested !== "all") return requested;
  return scope.companyId || null;
}

export function applyScopeToQuery(query: any, scope: UserScope, companyId?: string | null) {
  const resolvedCompany = companyId || scope.companyId || null;
  let q = query;
  if (resolvedCompany) {
    q = q.eq("company_id", resolvedCompany);
  }
  if (scope.usoIndividual) {
    q = q.eq("vendedor_id", scope.userId);
  }
  return q;
}

export async function fetchGestorEquipeIdsComGestor(client: any, gestorId: string) {
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

export function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}
