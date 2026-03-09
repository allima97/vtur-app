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

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
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

export async function GET({ request }: { request: Request }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }

    const { data, error } = await supabaseServer
      .from("consultorias_online")
      .select(
        `
          id,
          cliente_id,
          cliente_nome,
          data_hora,
          lembrete,
          destino,
          quantidade_pessoas,
          orcamento_id,
          taxa_consultoria,
          notas,
          fechada,
          fechada_em,
          created_at
        `
      )
      .order("data_hora", { ascending: true })
      .limit(200);

    if (error) {
      return new Response(`Falha ao listar consultorias: ${error.message}`, { status: 500 });
    }

    return jsonResponse(data || []);
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }

    const body = (await request.json()) as {
      clienteId?: string | null;
      clienteNome: string;
      dataHora: string;
      lembrete: string;
      destino?: string | null;
      quantidadePessoas?: number;
      orcamentoId?: string | null;
      taxaConsultoria?: number;
      notas?: string | null;
    };

    if (!body.clienteNome?.trim()) {
      return new Response("Cliente é obrigatório.", { status: 400 });
    }
    if (!body.dataHora) {
      return new Response("Data e hora são obrigatórias.", { status: 400 });
    }

    const registro = {
      cliente_id: body.clienteId || null,
      cliente_nome: body.clienteNome.trim(),
      data_hora: new Date(body.dataHora).toISOString(),
      lembrete: body.lembrete || "15min",
      destino: body.destino?.trim() || null,
      quantidade_pessoas: body.quantidadePessoas ?? 1,
      orcamento_id: body.orcamentoId || null,
      taxa_consultoria: Number.isFinite(body.taxaConsultoria ?? NaN)
        ? body.taxaConsultoria
        : 0,
      notas: body.notas?.trim() || null,
      created_by: user.id,
    };

    const { data, error } = await supabaseServer
      .from("consultorias_online")
      .insert(registro)
      .select(
        `
          id,
          cliente_nome,
          data_hora,
          lembrete,
          destino,
          quantidade_pessoas,
          orcamento_id,
          taxa_consultoria,
          notas,
          created_at
        `
      )
      .single();

    if (error) {
      return new Response(`Falha ao salvar consultoria: ${error.message}`, { status: 500 });
    }

    return jsonResponse(data, 201);
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}

export async function PATCH({ request }: { request: Request }) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return new Response("Sessão inválida.", { status: 401 });
    }

    const body = (await request.json()) as {
      id?: string;
      clienteId?: string | null;
      clienteNome?: string | null;
      dataHora?: string | null;
      lembrete?: string | null;
      destino?: string | null;
      quantidadePessoas?: number;
      orcamentoId?: string | null;
      taxaConsultoria?: number;
      notas?: string | null;
      fechada?: boolean;
      fechada_em?: string | null;
    };

    if (!body.id) {
      return new Response("Id da consultoria é obrigatório.", { status: 400 });
    }

    const payload: Record<string, any> = {};
    if (body.clienteId !== undefined) payload.cliente_id = body.clienteId || null;
    if (body.clienteNome !== undefined) payload.cliente_nome = body.clienteNome?.trim() || null;
    if (body.dataHora !== undefined && body.dataHora) {
      payload.data_hora = new Date(body.dataHora).toISOString();
    }
    if (body.lembrete !== undefined && body.lembrete !== null) payload.lembrete = body.lembrete;
    if (body.destino !== undefined) payload.destino = body.destino?.trim() || null;
    if (body.quantidadePessoas !== undefined) payload.quantidade_pessoas = body.quantidadePessoas;
    if (body.orcamentoId !== undefined) payload.orcamento_id = body.orcamentoId || null;
    if (body.taxaConsultoria !== undefined) payload.taxa_consultoria = body.taxaConsultoria;
    if (body.notas !== undefined) payload.notas = body.notas;
    if (body.fechada !== undefined) payload.fechada = body.fechada;
    if (body.fechada_em !== undefined) payload.fechada_em = body.fechada_em;

    if (!Object.keys(payload).length) {
      return new Response("Nenhum campo para atualizar.", { status: 400 });
    }

    const { error } = await supabaseServer
      .from("consultorias_online")
      .update(payload)
      .eq("id", body.id);

    if (error) {
      return new Response(`Falha ao atualizar consultoria: ${error.message}`, { status: 500 });
    }

    return new Response(null, { status: 204 });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
