import { supabaseServer, createServerClient, hasServiceRoleKey } from "../../../../lib/supabaseServer";
import { registrarLogServidor } from "../../../../lib/serverLogs";

import { getSupabaseEnv } from "../../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type BodyPayload = {
  user_id?: string;
  email?: string;
};

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

async function getUserFromRequest(request: Request) {
  const authClient = buildAuthClient(request);
  const { data, error } = await authClient.auth.getUser();
  if (error) return null;
  return data?.user ?? null;
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

async function masterCanAccessCompany(masterId: string, companyId: string) {
  const { data, error } = await supabaseServer
    .from("master_empresas")
    .select("id")
    .eq("master_id", masterId)
    .eq("company_id", companyId)
    .neq("status", "rejected")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function getRequesterAccess(userId: string) {
  const { data: selfData, error: selfErr } = await supabaseServer
    .from("users")
    .select("id, company_id, user_types(name)")
    .eq("id", userId)
    .maybeSingle();
  if (selfErr) throw selfErr;

  const tipo = String((selfData as any)?.user_types?.name || "").toUpperCase();
  const companyId = ((selfData as any)?.company_id as string | null) || null;

  let isMaster = tipo.includes("MASTER");

  if (!isMaster) {
    const { data: vinculoMaster, error: vincErr } = await supabaseServer
      .from("master_empresas")
      .select("id")
      .eq("master_id", userId)
      .neq("status", "rejected")
      .limit(1)
      .maybeSingle();
    if (vincErr) throw vincErr;
    if (vinculoMaster?.id) isMaster = true;
  }

  if (!isMaster) {
    const { data: moduloRows, error: moduloErr } = await supabaseServer
      .from("modulo_acesso")
      .select("modulo, ativo")
      .eq("usuario_id", userId)
      .in("modulo", [
        "MasterUsuarios",
        "MasterPermissoes",
        "MasterEmpresas",
        "masterusuarios",
        "masterpermissoes",
        "masterempresas",
      ]);
    if (!moduloErr) {
      const hasMasterModulo = Boolean((moduloRows || []).find((row: any) => row?.ativo !== false));
      if (hasMasterModulo) isMaster = true;
    }
  }

  return {
    isMaster,
    companyId,
  };
}

async function masterCanAccessTargetCompany(masterId: string, companyId: string, primaryCompanyId?: string | null) {
  if (!companyId) return false;
  if (primaryCompanyId && String(primaryCompanyId) === String(companyId)) return true;
  return await masterCanAccessCompany(masterId, companyId);
}

async function findTargetUser(payload: BodyPayload) {
  const rawUserId = String(payload.user_id || "").trim();
  const rawEmail = String(payload.email || "").trim().toLowerCase();

  if (!rawUserId && !rawEmail) {
    throw new Error("Informe user_id ou email.");
  }

  if (rawUserId && !isUuid(rawUserId)) {
    throw new Error("user_id invalido.");
  }

  let query = supabaseServer
    .from("users")
    .select("id, email, company_id, user_types(name)")
    .limit(1);

  if (rawUserId) {
    query = query.eq("id", rawUserId);
  } else {
    query = query.ilike("email", rawEmail);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data as
    | {
        id: string;
        email?: string | null;
        company_id?: string | null;
        user_types?: { name?: string | null } | null;
      }
    | null;
}

export async function POST({ request }: { request: Request }) {
  try {
    const requestUser = await getUserFromRequest(request);
    if (!requestUser) {
      return new Response(JSON.stringify({ error: "Sessao invalida." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!hasServiceRoleKey) {
      return new Response(
        JSON.stringify({ error: "SUPABASE_SERVICE_ROLE_KEY ausente no servidor." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const requesterAccess = await getRequesterAccess(requestUser.id);
    if (!requesterAccess.isMaster) {
      return new Response(JSON.stringify({ error: "Acesso negado." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await request.json().catch(() => ({}))) as BodyPayload;
    const targetUser = await findTargetUser(body);

    if (!targetUser?.id) {
      return new Response(JSON.stringify({ error: "Usuario nao encontrado." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const targetCompanyId = String(targetUser.company_id || "").trim();
    if (!targetCompanyId) {
      return new Response(JSON.stringify({ error: "Usuario alvo sem empresa vinculada." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const targetRole = String(targetUser.user_types?.name || "").toUpperCase();
    if (targetRole.includes("ADMIN") || targetRole.includes("MASTER")) {
      return new Response(JSON.stringify({ error: "Nao e permitido resetar 2FA deste cargo." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const canAccess = await masterCanAccessTargetCompany(
      requestUser.id,
      targetCompanyId,
      requesterAccess.companyId
    );
    if (!canAccess) {
      return new Response(JSON.stringify({ error: "Empresa fora do seu portfolio." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data: factorsData, error: factorsError } =
      await supabaseServer.auth.admin.mfa.listFactors({
        userId: targetUser.id,
      });
    if (factorsError) {
      return new Response(
        JSON.stringify({ error: factorsError.message || "Falha ao listar fatores MFA." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const factors = (factorsData?.factors || []) as Array<{ id: string }>;
    const deletedIds: string[] = [];

    for (const factor of factors) {
      const { error: deleteError } = await supabaseServer.auth.admin.mfa.deleteFactor({
        userId: targetUser.id,
        id: factor.id,
      });
      if (deleteError) {
        return new Response(
          JSON.stringify({ error: deleteError.message || "Falha ao remover fator MFA." }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
      deletedIds.push(factor.id);
    }

    await registrarLogServidor({
      user_id: requestUser.id,
      acao: "master_resetou_mfa",
      modulo: "MasterUsuarios",
      request,
      detalhes: {
        actor_user_id: requestUser.id,
        actor_role: "master",
        actor_company_id: requesterAccess.companyId,
        target_user_id: targetUser.id,
        target_email: targetUser.email || null,
        target_company_id: targetCompanyId,
        deleted_count: deletedIds.length,
        deleted_ids: deletedIds,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user_id: targetUser.id,
        email: targetUser.email || null,
        deleted_count: deletedIds.length,
        deleted_ids: deletedIds,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    const message = String(error?.message || error || "");
    const status = message === "Informe user_id ou email." || message === "user_id invalido." ? 400 : 500;
    return new Response(JSON.stringify({ error: message || "Erro interno." }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
