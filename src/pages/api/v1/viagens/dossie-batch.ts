import { createServerClient } from "../../../../lib/supabaseServer";
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

function resolveRoles(usoIndividual: boolean) {
  const deveRestringirResponsavel = usoIndividual;
  return { deveRestringirResponsavel };
}

async function loadDossie(client: any, params: { viagemId: string; companyId: string; userId: string; deveRestringirResponsavel: boolean; }) {
  let query = client
    .from("viagens")
    .select(
      `
      id,
      company_id,
      venda_id,
      orcamento_id,
      data_inicio,
      data_fim,
      status,
      origem,
      destino,
      responsavel_user_id,
      responsavel:users!responsavel_user_id (
        nome_completo
      ),
      observacoes,
      follow_up_text,
      follow_up_fechado,
      venda:vendas (
        id,
        cliente_id,
        destino_id,
        clientes:clientes (
          id,
          nome
        ),
        vendas_recibos (
          id,
          numero_recibo,
          valor_total,
          valor_taxas,
          data_inicio,
          data_fim,
          produto_id,
          produto_resolvido_id,
          tipo_produtos (
            id,
            nome,
            tipo
          ),
          produto_resolvido:produtos!produto_resolvido_id (
            id,
            nome
          )
        )
      ),
      viagem_acompanhantes (
        id,
        acompanhante_id,
        papel,
        documento_url,
        observacoes,
        cliente_acompanhantes:acompanhante_id (
          nome_completo,
          cpf,
          rg,
          telefone,
          grau_parentesco
        )
      ),
      viagem_servicos (
        id,
        tipo,
        fornecedor,
        descricao,
        status,
        data_inicio,
        data_fim,
        valor,
        moeda,
        voucher_url,
        observacoes
      ),
      viagem_documentos (
        id,
        titulo,
        tipo,
        url,
        mime_type,
        size_bytes,
        created_at
      )
    `
    )
    .eq("id", params.viagemId)
    .eq("company_id", params.companyId);

  if (params.deveRestringirResponsavel) {
    query = query.eq("responsavel_user_id", params.userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const detalhe = data || null;
  if (!detalhe) return null;

  let viagensVenda = [] as any[];
  if (detalhe?.venda_id) {
    let viagensQuery = client
      .from("viagens")
      .select("id, recibo_id, origem, destino, status, data_inicio, data_fim, observacoes")
      .eq("venda_id", detalhe.venda_id)
      .eq("company_id", params.companyId);
    if (params.deveRestringirResponsavel) {
      viagensQuery = viagensQuery.eq("responsavel_user_id", params.userId);
    }
    const { data: viagensData, error: viagensErr } = await viagensQuery;
    if (viagensErr) throw viagensErr;
    viagensVenda = viagensData || [];
  }

  let acompanhantesCliente: any[] = [];
  const clienteBaseId = detalhe?.venda?.cliente_id || null;
  if (clienteBaseId) {
    const { data: acompDisp, error: acompErr } = await client
      .from("cliente_acompanhantes")
      .select("id, nome_completo, cpf, telefone, grau_parentesco")
      .eq("cliente_id", clienteBaseId)
      .eq("ativo", true)
      .order("nome_completo", { ascending: true });
    if (acompErr) throw acompErr;
    acompanhantesCliente = acompDisp || [];
  }

  return { detalhe, viagensVenda, acompanhantesCliente };
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const body = await request.json().catch(() => null);
    const viagemId = String(body?.viagemId || "").trim();
    const action = String(body?.action || "").trim();
    const data = body?.data || {};

    if (!viagemId || !action) {
      return new Response("Parametros invalidos.", { status: 400 });
    }

    const { data: perfil, error: perfilErr } = await client
      .from("users")
      .select("company_id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (perfilErr) throw perfilErr;

    const companyId = String((perfil as any)?.company_id || "").trim();
    if (!companyId) {
      return new Response("Empresa nao encontrada.", { status: 400 });
    }

    const usoIndividual = Boolean((perfil as any)?.uso_individual);
    const tipoNome = String((perfil as any)?.user_types?.name || "");
    const { deveRestringirResponsavel } = resolveRoles(usoIndividual);

    let viagemBaseQuery = client
      .from("viagens")
      .select("id, company_id, venda_id, responsavel_user_id")
      .eq("id", viagemId)
      .eq("company_id", companyId);
    if (deveRestringirResponsavel) {
      viagemBaseQuery = viagemBaseQuery.eq("responsavel_user_id", user.id);
    }
    const { data: viagemRow, error: viagemErr } = await viagemBaseQuery.maybeSingle();
    if (viagemErr) throw viagemErr;
    if (!viagemRow) return new Response("Viagem nao encontrada.", { status: 404 });

    if (action === "acompanhante_save") {
      const payload = {
        viagem_id: viagemRow.id,
        company_id: viagemRow.company_id,
        acompanhante_id: data?.acompanhante_id || null,
        papel: data?.papel || null,
        documento_url: data?.documento_url || null,
        observacoes: data?.observacoes || null,
      };
      if (data?.id) {
        const { error } = await client
          .from("viagem_acompanhantes")
          .update(payload)
          .eq("id", data.id)
          .eq("viagem_id", viagemRow.id);
        if (error) throw error;
      } else {
        const { error } = await client.from("viagem_acompanhantes").insert(payload);
        if (error) throw error;
      }
    } else if (action === "acompanhante_delete") {
      const { error } = await client
        .from("viagem_acompanhantes")
        .delete()
        .eq("id", data?.id)
        .eq("viagem_id", viagemRow.id);
      if (error) throw error;
    } else if (action === "cliente_acompanhante_create") {
      const payload = {
        cliente_id: data?.cliente_id || null,
        company_id: viagemRow.company_id,
        nome_completo: data?.nome_completo || "",
        cpf: data?.cpf || null,
        telefone: data?.telefone || null,
        grau_parentesco: data?.grau_parentesco || null,
        rg: data?.rg || null,
        data_nascimento: data?.data_nascimento || null,
        observacoes: data?.observacoes || null,
        ativo: Boolean(data?.ativo ?? true),
      };
      const { error } = await client.from("cliente_acompanhantes").insert(payload);
      if (error) throw error;
    } else if (action === "servico_save") {
      const payload = {
        viagem_id: viagemRow.id,
        company_id: viagemRow.company_id,
        tipo: data?.tipo || "outro",
        fornecedor: data?.fornecedor || null,
        descricao: data?.descricao || null,
        status: data?.status || null,
        data_inicio: data?.data_inicio || null,
        data_fim: data?.data_fim || null,
        valor: data?.valor ?? null,
        moeda: data?.moeda || "BRL",
        voucher_url: data?.voucher_url || null,
        observacoes: data?.observacoes || null,
      };
      if (data?.id) {
        const { error } = await client
          .from("viagem_servicos")
          .update(payload)
          .eq("id", data.id)
          .eq("viagem_id", viagemRow.id);
        if (error) throw error;
      } else {
        const { error } = await client.from("viagem_servicos").insert(payload);
        if (error) throw error;
      }
    } else if (action === "servico_delete") {
      const { error } = await client
        .from("viagem_servicos")
        .delete()
        .eq("id", data?.id)
        .eq("viagem_id", viagemRow.id);
      if (error) throw error;
    } else if (action === "documento_create") {
      const payload = {
        viagem_id: viagemRow.id,
        company_id: viagemRow.company_id,
        titulo: data?.titulo || "",
        tipo: data?.tipo || "outro",
        url: data?.url || null,
        mime_type: data?.mime_type || null,
        size_bytes: data?.size_bytes || null,
      };
      const { error } = await client.from("viagem_documentos").insert(payload);
      if (error) throw error;
    } else if (action === "documento_delete") {
      const { error } = await client
        .from("viagem_documentos")
        .delete()
        .eq("id", data?.id)
        .eq("viagem_id", viagemRow.id);
      if (error) throw error;
    } else if (action === "followup_save") {
      const payload = {
        follow_up_text: data?.texto || null,
        follow_up_fechado: Boolean(data?.fechado),
      };
      let updateQuery = client.from("viagens").update(payload);
      if (viagemRow.venda_id) {
        updateQuery = updateQuery.eq("venda_id", viagemRow.venda_id);
      } else {
        updateQuery = updateQuery.eq("id", viagemRow.id);
      }
      updateQuery = updateQuery.eq("company_id", viagemRow.company_id);
      if (deveRestringirResponsavel) {
        updateQuery = updateQuery.eq("responsavel_user_id", user.id);
      }
      const { error } = await updateQuery;
      if (error) throw error;
    } else {
      return new Response("Acao invalida.", { status: 400 });
    }

    const loaded = await loadDossie(client, {
      viagemId,
      companyId,
      userId: user.id,
      deveRestringirResponsavel,
    });
    if (!loaded) return new Response("Viagem nao encontrada.", { status: 404 });

    const payload = {
      viagem: loaded.detalhe,
      viagensVenda: loaded.viagensVenda,
      acompanhantesCliente: loaded.acompanhantesCliente,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (e: any) {
    console.error("Erro dossie batch:", e);
    return new Response("Erro ao salvar dossie.", { status: 500 });
  }
}
