import { kvCache } from "../../../../lib/kvCache";
import { buildAuthClient, getUserScope, requireModuloLevel } from "../vendas/_utils";

const CACHE_TTL_SECONDS = 600;

function buildCacheKey(companyId: string | null) {
  return ["v1", "parametrosSistema", companyId || "sem-company"].join("|");
}

type ParametrosPayload = {
  id?: string | null;
  company_id: string | null;
  owner_user_id?: string | null;
  owner_user_nome?: string | null;
  usar_taxas_na_meta: boolean;
  foco_valor: "bruto" | "liquido";
  modo_corporativo: boolean;
  politica_cancelamento: "cancelar_venda" | "estornar_recibos";
  foco_faturamento: "bruto" | "liquido";
  conciliacao_sobrepoe_vendas: boolean;
  conciliacao_regra_ativa: boolean;
  conciliacao_meta_nao_atingida: number | null;
  conciliacao_meta_atingida: number | null;
  conciliacao_super_meta: number | null;
  mfa_obrigatorio: boolean;
  exportacao_pdf: boolean;
  exportacao_excel: boolean;
};

const DEFAULT_PARAMS: ParametrosPayload = {
  company_id: null,
  owner_user_id: null,
  usar_taxas_na_meta: false,
  foco_valor: "bruto",
  modo_corporativo: false,
  politica_cancelamento: "cancelar_venda",
  foco_faturamento: "bruto",
  conciliacao_sobrepoe_vendas: false,
  conciliacao_regra_ativa: false,
  conciliacao_meta_nao_atingida: null,
  conciliacao_meta_atingida: null,
  conciliacao_super_meta: null,
  mfa_obrigatorio: false,
  exportacao_pdf: false,
  exportacao_excel: false,
};

export async function GET({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["parametros"],
        1,
        "Sem acesso aos parametros."
      );
      if (denied) return denied;
    }

    const cacheKey = buildCacheKey(scope.companyId);
    const cached = await kvCache.get<any>(cacheKey);
    if (cached) {
      return new Response(JSON.stringify(cached), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: userRow, error: userErr } = await client
      .from("users")
      .select("company_id, nome_completo")
      .eq("id", user.id)
      .maybeSingle();
    if (userErr) throw userErr;

    const companyId = userRow?.company_id || null;
    const usuarioNome = userRow?.nome_completo || null;

    const { data, error } = await client
      .from("parametros_comissao")
      .select(
        "id, company_id, owner_user_id, usar_taxas_na_meta, foco_valor, modo_corporativo, politica_cancelamento, foco_faturamento, conciliacao_sobrepoe_vendas, conciliacao_regra_ativa, conciliacao_meta_nao_atingida, conciliacao_meta_atingida, conciliacao_super_meta, mfa_obrigatorio, exportacao_pdf, exportacao_excel, updated_at, created_at, owner_user:owner_user_id (nome_completo)"
      )
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;

    let payload: any = {
      params: {
        ...DEFAULT_PARAMS,
        company_id: companyId,
        owner_user_id: user.id,
        owner_user_nome: usuarioNome,
      },
      ultima_atualizacao: null,
      origem: "default",
      owner_nome: usuarioNome,
    };

    if (data) {
      payload = {
        params: {
          id: data.id,
          company_id: companyId,
          owner_user_id: data.owner_user_id || user.id,
          owner_user_nome: (data as any)?.owner_user?.nome_completo || usuarioNome,
          usar_taxas_na_meta: !!data.usar_taxas_na_meta,
          foco_valor: data.foco_valor === "liquido" ? "liquido" : "bruto",
          modo_corporativo: !!data.modo_corporativo,
          politica_cancelamento:
            data.politica_cancelamento === "estornar_recibos"
              ? "estornar_recibos"
              : "cancelar_venda",
          foco_faturamento: data.foco_faturamento === "liquido" ? "liquido" : "bruto",
          conciliacao_sobrepoe_vendas: !!data.conciliacao_sobrepoe_vendas,
          conciliacao_regra_ativa: !!data.conciliacao_regra_ativa,
          conciliacao_meta_nao_atingida:
            data.conciliacao_meta_nao_atingida != null
              ? Number(data.conciliacao_meta_nao_atingida)
              : null,
          conciliacao_meta_atingida:
            data.conciliacao_meta_atingida != null
              ? Number(data.conciliacao_meta_atingida)
              : null,
          conciliacao_super_meta:
            data.conciliacao_super_meta != null ? Number(data.conciliacao_super_meta) : null,
          mfa_obrigatorio: !!data.mfa_obrigatorio,
          exportacao_pdf: !!data.exportacao_pdf,
          exportacao_excel: !!data.exportacao_excel,
        },
        ultima_atualizacao: data.updated_at || data.created_at || null,
        origem: "banco",
        owner_nome: (data as any)?.owner_user?.nome_completo || usuarioNome,
      };
    }

    await kvCache.set(cacheKey, payload, CACHE_TTL_SECONDS);

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro parametros/sistema", err);
    return new Response("Erro ao carregar parametros.", { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const scope = await getUserScope(client, user.id);
    if (!scope.isAdmin) {
      const denied = await requireModuloLevel(
        client,
        user.id,
        ["parametros"],
        3,
        "Sem permissao para editar parametros."
      );
      if (denied) return denied;
    }

    const body = (await request.json()) as Partial<ParametrosPayload>;

    const { data: userRow, error: userErr } = await client
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (userErr) throw userErr;

    const payload = {
      company_id: userRow?.company_id || null,
      owner_user_id: user.id,
      usar_taxas_na_meta: Boolean(body.usar_taxas_na_meta),
      foco_valor: body.foco_valor === "liquido" ? "liquido" : "bruto",
      modo_corporativo: Boolean(body.modo_corporativo),
      politica_cancelamento:
        body.politica_cancelamento === "estornar_recibos" ? "estornar_recibos" : "cancelar_venda",
      foco_faturamento: body.foco_faturamento === "liquido" ? "liquido" : "bruto",
      conciliacao_sobrepoe_vendas: Boolean(body.conciliacao_sobrepoe_vendas),
      conciliacao_regra_ativa: Boolean(body.conciliacao_regra_ativa),
      conciliacao_meta_nao_atingida:
        body.conciliacao_meta_nao_atingida != null
          ? Number(body.conciliacao_meta_nao_atingida)
          : null,
      conciliacao_meta_atingida:
        body.conciliacao_meta_atingida != null ? Number(body.conciliacao_meta_atingida) : null,
      conciliacao_super_meta:
        body.conciliacao_super_meta != null ? Number(body.conciliacao_super_meta) : null,
      mfa_obrigatorio: Boolean(body.mfa_obrigatorio),
      exportacao_pdf: Boolean(body.exportacao_pdf),
      exportacao_excel: Boolean(body.exportacao_excel),
    };

    const { data, error } = await client
      .from("parametros_comissao")
      .upsert(payload, { onConflict: "company_id" })
      .select("id")
      .single();
    if (error) throw error;

    await kvCache.delete(buildCacheKey(payload.company_id || null));

    return new Response(JSON.stringify({ id: data?.id || null }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erro parametros/sistema POST", err);
    return new Response("Erro ao salvar parametros.", { status: 500 });
  }
}
