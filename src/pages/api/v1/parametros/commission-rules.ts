import { supabaseServer } from "../../../../lib/supabaseServer";
import { buildAuthClient, getUserScope, requireModuloLevel } from "../vendas/_utils";

type TierPayload = {
  faixa: "PRE" | "POS";
  de_pct: number;
  ate_pct: number;
  inc_pct_meta: number;
  inc_pct_comissao: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeTipo(value: unknown): "GERAL" | "ESCALONAVEL" {
  return String(value || "").trim().toUpperCase() === "ESCALONAVEL"
    ? "ESCALONAVEL"
    : "GERAL";
}

function normalizeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeTiers(value: unknown): TierPayload[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tier: any) => {
      const faixa = String(tier?.faixa || "").trim().toUpperCase();
      if (faixa !== "PRE" && faixa !== "POS") return null;
      return {
        faixa,
        de_pct: normalizeNumber(tier?.de_pct, 0),
        ate_pct: normalizeNumber(tier?.ate_pct, 0),
        inc_pct_meta: normalizeNumber(tier?.inc_pct_meta, 0),
        inc_pct_comissao: normalizeNumber(tier?.inc_pct_comissao, 0),
      } as TierPayload;
    })
    .filter((tier): tier is TierPayload => Boolean(tier));
}

async function requireAccess(request: Request, minLevel: number) {
  const authClient = buildAuthClient(request);
  const { data: authData, error: authErr } = await authClient.auth.getUser();
  const user = authData?.user ?? null;
  if (authErr || !user) {
    return { authClient, user: null, denied: new Response("Sessao invalida.", { status: 401 }) };
  }

  const scope = await getUserScope(authClient, user.id);
  if (!scope.isAdmin) {
    const denied = await requireModuloLevel(
      authClient,
      user.id,
      ["parametros", "regrascomissao"],
      minLevel,
      "Sem acesso às regras de comissão."
    );
    if (denied) return { authClient, user, denied };
  }

  return { authClient, user, denied: null };
}

export async function GET({ request }: { request: Request }) {
  try {
    const access = await requireAccess(request, 1);
    if (access.denied) return access.denied;

    const { data, error } = await supabaseServer
      .from("commission_rule")
      .select("*, commission_tier(*)")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return json(Array.isArray(data) ? data : []);
  } catch (err) {
    console.error("Erro parametros/commission-rules GET", err);
    return new Response("Erro ao carregar regras de comissão.", { status: 500 });
  }
}

export async function POST({ request }: { request: Request }) {
  try {
    const access = await requireAccess(request, 3);
    if (access.denied) return access.denied;

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const nome = String(body?.nome || "").trim();
    if (!nome) return new Response("Nome é obrigatório.", { status: 400 });

    const payload = {
      nome,
      descricao: String(body?.descricao || "").trim() || null,
      tipo: normalizeTipo(body?.tipo),
      meta_nao_atingida: normalizeNumber(body?.meta_nao_atingida, 0),
      meta_atingida: normalizeNumber(body?.meta_atingida, 0),
      super_meta: normalizeNumber(body?.super_meta, 0),
      ativo: body?.ativo === undefined ? true : Boolean(body?.ativo),
    };

    const ruleId = String(body?.id || "").trim();
    let persistedId = ruleId || null;

    if (persistedId) {
      const { error } = await supabaseServer
        .from("commission_rule")
        .update(payload)
        .eq("id", persistedId);
      if (error) throw error;
    } else {
      const { data, error } = await supabaseServer
        .from("commission_rule")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      persistedId = String(data?.id || "").trim() || null;
    }

    if (!persistedId) {
      return new Response("Não foi possível identificar a regra salva.", { status: 500 });
    }

    const tiers = sanitizeTiers(body?.tiers);
    const { error: deleteError } = await supabaseServer
      .from("commission_tier")
      .delete()
      .eq("rule_id", persistedId);
    if (deleteError) throw deleteError;

    if (tiers.length > 0) {
      const { error: tierErr } = await supabaseServer.from("commission_tier").insert(
        tiers.map((tier) => ({
          rule_id: persistedId,
          faixa: tier.faixa,
          de_pct: tier.de_pct,
          ate_pct: tier.ate_pct,
          inc_pct_meta: tier.inc_pct_meta,
          inc_pct_comissao: tier.inc_pct_comissao,
          ativo: true,
        }))
      );
      if (tierErr) throw tierErr;
    }

    return json({ ok: true, id: persistedId });
  } catch (err) {
    console.error("Erro parametros/commission-rules POST", err);
    return new Response("Erro ao salvar regra de comissão.", { status: 500 });
  }
}

export async function PATCH({ request }: { request: Request }) {
  try {
    const access = await requireAccess(request, 3);
    if (access.denied) return access.denied;

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const id = String(body?.id || "").trim();
    if (!id) return new Response("ID obrigatório.", { status: 400 });

    const payload: Record<string, unknown> = {};
    if ("ativo" in (body || {})) {
      payload.ativo = Boolean(body?.ativo);
    }
    if (Object.keys(payload).length === 0) {
      return new Response("Nenhuma alteração enviada.", { status: 400 });
    }

    const { error } = await supabaseServer
      .from("commission_rule")
      .update(payload)
      .eq("id", id);
    if (error) throw error;

    return json({ ok: true, id });
  } catch (err) {
    console.error("Erro parametros/commission-rules PATCH", err);
    return new Response("Erro ao atualizar regra de comissão.", { status: 500 });
  }
}

export async function DELETE({ request }: { request: Request }) {
  try {
    const access = await requireAccess(request, 3);
    if (access.denied) return access.denied;

    const rawBody = await request.text();
    const body = safeJsonParse(rawBody) as any;
    const id = String(body?.id || "").trim();
    if (!id) return new Response("ID obrigatório.", { status: 400 });

    const { error: tierErr } = await supabaseServer
      .from("commission_tier")
      .delete()
      .eq("rule_id", id);
    if (tierErr) throw tierErr;

    const { error } = await supabaseServer
      .from("commission_rule")
      .delete()
      .eq("id", id);
    if (error) throw error;

    return json({ ok: true, id });
  } catch (err) {
    console.error("Erro parametros/commission-rules DELETE", err);
    return new Response("Erro ao excluir regra de comissão.", { status: 500 });
  }
}
