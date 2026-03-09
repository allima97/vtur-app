import { supabaseServer, createServerClient } from "../../lib/supabaseServer";

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

type BodyPayload = {
  cnpj?: string | null;
  nome_empresa?: string | null;
  nome_fantasia?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  allowCreate?: boolean | null;
};

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST({ request }: { request: Request }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }
    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      return new Response("Apenas administradores podem cadastrar empresas.", { status: 403 });
    }

    const body = (await request.json()) as BodyPayload;
    const cnpjRaw = body.cnpj ?? "";
    const cnpjLimpo = cnpjRaw.replace(/\D/g, "");
    if (!cnpjLimpo || cnpjLimpo.length !== 14) {
      return new Response("CNPJ invalido.", { status: 400 });
    }

    const selectCols =
      "id, nome_empresa, nome_fantasia, cnpj, endereco, telefone, cidade, estado";

    const { data: existente, error: selectErr } = await supabaseServer
      .from("companies")
      .select(selectCols)
      .eq("cnpj", cnpjLimpo)
      .limit(1)
      .maybeSingle();

    if (selectErr) {
      return new Response(`Falha ao buscar empresa: ${selectErr.message}`, { status: 500 });
    }

    if (existente) {
      return jsonResponse(existente, 200);
    }

    if (!body.allowCreate) {
      return new Response("Empresa nao encontrada.", { status: 404 });
    }

    const nomeEmpresa = (body.nome_empresa ?? "").trim();
    if (!nomeEmpresa) {
      return new Response("Informe o nome da empresa.", { status: 400 });
    }

    const payload = {
      cnpj: cnpjLimpo,
      nome_empresa: nomeEmpresa,
      nome_fantasia: (body.nome_fantasia ?? "").trim() || nomeEmpresa,
      telefone: (body.telefone ?? "").trim() || null,
      endereco: (body.endereco ?? "").trim() || null,
      cidade: (body.cidade ?? "").trim() || null,
      estado: (body.estado ?? "").trim().toUpperCase().slice(0, 2) || null,
    };

    const { data: criada, error: createErr } = await supabaseServer
      .from("companies")
      .insert(payload)
      .select(selectCols)
      .single();

    if (createErr) {
      return new Response(`Falha ao criar empresa: ${createErr.message}`, { status: 500 });
    }

    return jsonResponse(criada, 201);
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
