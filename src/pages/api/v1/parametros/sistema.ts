import { kvCache } from "../../../../lib/kvCache";
import {
  createDefaultConciliacaoBandRules,
  sanitizeConciliacaoBandRules,
  type ConciliacaoCommissionBandRule,
} from "../../../../lib/comissaoUtils";
import { buildAuthClient, getUserScope, requireModuloLevel } from "../vendas/_utils";

const CACHE_TTL_SECONDS = 600;

function buildCacheKey(companyId: string | null) {
  return ["v1", "parametrosSistema", companyId || "sem-company"].join("|");
}

function extractMissingColumn(error: any) {
  const message = String(error?.message || "");
  const match =
    message.match(/column ["']?([a-zA-Z0-9_]+)["']? does not exist/i) ||
    message.match(/Could not find the ['"]([a-zA-Z0-9_]+)['"] column/i);
  return match?.[1] || null;
}

async function upsertParametrosComFallback(client: any, initialPayload: Record<string, any>) {
  let payload = { ...initialPayload };
  const removableKeys = new Set([
    "conciliacao_sobrepoe_vendas",
    "conciliacao_regra_ativa",
    "conciliacao_tipo",
    "conciliacao_meta_nao_atingida",
    "conciliacao_meta_atingida",
    "conciliacao_super_meta",
    "conciliacao_tiers",
    "conciliacao_faixas_loja",
    "mfa_obrigatorio",
    "exportacao_pdf",
    "exportacao_excel",
    "modo_corporativo",
    "politica_cancelamento",
    "foco_faturamento",
  ]);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await client
      .from("parametros_comissao")
      .upsert(payload, { onConflict: "company_id" })
      .select("id")
      .single();
    if (!error) return { data, payload };

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || !removableKeys.has(missingColumn) || !(missingColumn in payload)) {
      throw error;
    }
    delete payload[missingColumn];
  }

  throw new Error("Não foi possível salvar os parâmetros com fallback de schema.");
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
  conciliacao_tipo: "GERAL" | "ESCALONAVEL";
  conciliacao_meta_nao_atingida: number | null;
  conciliacao_meta_atingida: number | null;
  conciliacao_super_meta: number | null;
  conciliacao_tiers: Array<{
    faixa: "PRE" | "POS";
    de_pct: number;
    ate_pct: number;
    inc_pct_meta: number;
    inc_pct_comissao: number;
  }>;
  conciliacao_faixas_loja: ConciliacaoCommissionBandRule[];
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
  conciliacao_tipo: "GERAL",
  conciliacao_meta_nao_atingida: null,
  conciliacao_meta_atingida: null,
  conciliacao_super_meta: null,
  conciliacao_tiers: [],
  conciliacao_faixas_loja: createDefaultConciliacaoBandRules({
    usar_taxas_na_meta: false,
    conciliacao_regra_ativa: false,
    conciliacao_tipo: "GERAL",
    conciliacao_meta_nao_atingida: null,
    conciliacao_meta_atingida: null,
    conciliacao_super_meta: null,
    conciliacao_tiers: [],
  }),
  mfa_obrigatorio: false,
  exportacao_pdf: false,
  exportacao_excel: false,
};

function normalizeConciliacaoTipo(value?: string | null): "GERAL" | "ESCALONAVEL" {
  return String(value || "").trim().toUpperCase() === "ESCALONAVEL" ? "ESCALONAVEL" : "GERAL";
}

function sanitizeConciliacaoTiers(value: unknown) {
  if (!Array.isArray(value)) return [] as ParametrosPayload["conciliacao_tiers"];
  return value
    .map((tier: any) => {
      const faixa = String(tier?.faixa || "").trim().toUpperCase();
      if (faixa !== "PRE" && faixa !== "POS") return null;
      const dePct = Number(tier?.de_pct ?? 0);
      const atePct = Number(tier?.ate_pct ?? 0);
      const incMeta = Number(tier?.inc_pct_meta ?? 0);
      const incCom = Number(tier?.inc_pct_comissao ?? 0);
      if (![dePct, atePct, incMeta, incCom].every(Number.isFinite)) return null;
      return {
        faixa,
        de_pct: dePct,
        ate_pct: atePct,
        inc_pct_meta: incMeta,
        inc_pct_comissao: incCom,
      } as ParametrosPayload["conciliacao_tiers"][number];
    })
    .filter((item): item is ParametrosPayload["conciliacao_tiers"][number] => Boolean(item));
}

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
      .select("*")
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;

    let ownerNomeDb = usuarioNome;
    const ownerUserId = String((data as any)?.owner_user_id || "").trim();
    if (ownerUserId) {
      const { data: ownerRow, error: ownerErr } = await client
        .from("users")
        .select("nome_completo")
        .eq("id", ownerUserId)
        .maybeSingle();
      if (!ownerErr) {
        ownerNomeDb = ownerRow?.nome_completo || ownerNomeDb;
      }
    }

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
          owner_user_nome: ownerNomeDb,
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
          conciliacao_tipo: normalizeConciliacaoTipo((data as any).conciliacao_tipo),
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
          conciliacao_tiers: sanitizeConciliacaoTiers((data as any).conciliacao_tiers),
          conciliacao_faixas_loja: sanitizeConciliacaoBandRules(
            (data as any).conciliacao_faixas_loja,
            {
              usar_taxas_na_meta: !!data.usar_taxas_na_meta,
              foco_valor: data.foco_valor === "liquido" ? "liquido" : "bruto",
              foco_faturamento: data.foco_faturamento === "liquido" ? "liquido" : "bruto",
              conciliacao_sobrepoe_vendas: !!data.conciliacao_sobrepoe_vendas,
              conciliacao_regra_ativa: !!data.conciliacao_regra_ativa,
              conciliacao_tipo: normalizeConciliacaoTipo((data as any).conciliacao_tipo),
              conciliacao_meta_nao_atingida:
                data.conciliacao_meta_nao_atingida != null
                  ? Number(data.conciliacao_meta_nao_atingida)
                  : null,
              conciliacao_meta_atingida:
                data.conciliacao_meta_atingida != null
                  ? Number(data.conciliacao_meta_atingida)
                  : null,
              conciliacao_super_meta:
                data.conciliacao_super_meta != null
                  ? Number(data.conciliacao_super_meta)
                  : null,
              conciliacao_tiers: sanitizeConciliacaoTiers((data as any).conciliacao_tiers),
            }
          ),
          mfa_obrigatorio: !!data.mfa_obrigatorio,
          exportacao_pdf: !!data.exportacao_pdf,
          exportacao_excel: !!data.exportacao_excel,
        },
        ultima_atualizacao: data.updated_at || data.created_at || null,
        origem: "banco",
        owner_nome: ownerNomeDb,
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
      conciliacao_tipo: normalizeConciliacaoTipo(body.conciliacao_tipo),
      conciliacao_meta_nao_atingida:
        body.conciliacao_meta_nao_atingida != null
          ? Number(body.conciliacao_meta_nao_atingida)
          : null,
      conciliacao_meta_atingida:
        body.conciliacao_meta_atingida != null ? Number(body.conciliacao_meta_atingida) : null,
      conciliacao_super_meta:
        body.conciliacao_super_meta != null ? Number(body.conciliacao_super_meta) : null,
      conciliacao_tiers: sanitizeConciliacaoTiers(body.conciliacao_tiers),
      conciliacao_faixas_loja: sanitizeConciliacaoBandRules(body.conciliacao_faixas_loja, {
        usar_taxas_na_meta: Boolean(body.usar_taxas_na_meta),
        foco_valor: body.foco_valor === "liquido" ? "liquido" : "bruto",
        foco_faturamento: body.foco_faturamento === "liquido" ? "liquido" : "bruto",
        conciliacao_sobrepoe_vendas: Boolean(body.conciliacao_sobrepoe_vendas),
        conciliacao_regra_ativa: Boolean(body.conciliacao_regra_ativa),
        conciliacao_tipo: normalizeConciliacaoTipo(body.conciliacao_tipo),
        conciliacao_meta_nao_atingida:
          body.conciliacao_meta_nao_atingida != null
            ? Number(body.conciliacao_meta_nao_atingida)
            : null,
        conciliacao_meta_atingida:
          body.conciliacao_meta_atingida != null
            ? Number(body.conciliacao_meta_atingida)
            : null,
        conciliacao_super_meta:
          body.conciliacao_super_meta != null
            ? Number(body.conciliacao_super_meta)
            : null,
        conciliacao_tiers: sanitizeConciliacaoTiers(body.conciliacao_tiers),
      }),
      mfa_obrigatorio: Boolean(body.mfa_obrigatorio),
      exportacao_pdf: Boolean(body.exportacao_pdf),
      exportacao_excel: Boolean(body.exportacao_excel),
    };

    const { data } = await upsertParametrosComFallback(client, payload);

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
