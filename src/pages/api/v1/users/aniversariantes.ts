import { createServerClient, supabaseServer, hasServiceRoleKey } from "../../../../lib/supabaseServer";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type UsuarioItem = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  data_nascimento: string | null;
  active: boolean;
  uso_individual: boolean | null;
  company_id: string | null;
  user_types?: { name: string | null } | null;
  companies?: { nome_fantasia: string | null } | null;
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

function resolveMonth(raw: string | null) {
  const parsed = Number(raw);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 12) return parsed;
  return new Date().getMonth() + 1;
}

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

function isRoleAllowed(role: string) {
  const upper = role.toUpperCase();
  return (
    upper.includes("ADMIN") ||
    upper.includes("MASTER") ||
    upper.includes("GESTOR") ||
    upper.includes("VENDEDOR")
  );
}

function parseDateToUTC(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return new Date(NaN);

  // If it contains a leading YYYY-MM-DD (date or timestamp), normalize using only the date part.
  // This avoids timezone shifts when the DB column is timestamptz.
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix?.[1]) {
    return new Date(`${isoPrefix[1]}T00:00:00Z`);
  }

  // Legacy pt-BR date (DD/MM/YYYY)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/");
    return new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  }

  // If it already looks like an ISO/timestamp, let Date parse it.
  if (raw.includes("T") || raw.includes(" ")) {
    return new Date(raw);
  }

  // Date-only (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00Z`);
  }

  // Fallback: try to take the date part before any time separators.
  const datePart = raw.split("T")[0].split(" ")[0];
  return new Date(`${datePart}T00:00:00Z`);
}

function monthOfDate(value?: string | null): number | null {
  if (!value) return null;
  const dt = parseDateToUTC(value);
  const month = dt.getUTCMonth() + 1;
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return month;
}

function sortByDayThenName(a: UsuarioItem, b: UsuarioItem) {
  const dayA = a.data_nascimento ? parseDateToUTC(a.data_nascimento).getUTCDate() : 99;
  const dayB = b.data_nascimento ? parseDateToUTC(b.data_nascimento).getUTCDate() : 99;
  if (dayA !== dayB) return dayA - dayB;
  const nameA = String(a.nome_completo || "").toLowerCase();
  const nameB = String(b.nome_completo || "").toLowerCase();
  return nameA.localeCompare(nameB);
}

function uniqById(items: UsuarioItem[]) {
  const map = new Map<string, UsuarioItem>();
  for (const item of items) {
    if (!item?.id) continue;
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

async function safeFetchMasterIdsForCompany(
  client: any,
  companyId: string
): Promise<string[]> {
  try {
    const { data, error } = await client
      .from("master_empresas")
      .select("master_id, status")
      .eq("company_id", companyId)
      .neq("status", "rejected");
    if (error) throw error;
    return Array.from(
      new Set((data || []).map((row: any) => row?.master_id).filter(Boolean))
    ).map(String);
  } catch (e: any) {
    const code = String(e?.code || "");
    const msg = String(e?.message || "");
    if (!hasServiceRoleKey && (code === "42501" || msg.toLowerCase().includes("row-level security"))) {
      return [];
    }
    throw e;
  }
}

async function safeFetchMasterCompanyIds(client: any, masterId: string): Promise<string[]> {
  const { data, error } = await client
    .from("master_empresas")
    .select("company_id, status")
    .eq("master_id", masterId)
    .neq("status", "rejected");
  if (error) throw error;
  return Array.from(new Set((data || []).map((row: any) => row?.company_id).filter(Boolean))).map(String);
}

async function fetchUsersByCompanyIds(client: any, companyIds: string[]) {
  let query = client
    .from("users")
    .select(
      "id, nome_completo, email, data_nascimento, active, uso_individual, company_id, user_types(name), companies(nome_fantasia)"
    )
    .or("active.is.null,active.eq.true")
    .or("uso_individual.is.null,uso_individual.eq.false")
    .not("data_nascimento", "is", null)
    .order("nome_completo", { ascending: true })
    .limit(5000);

  if (companyIds.length > 0) {
    query = query.in("company_id", companyIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as UsuarioItem[];
}

async function fetchUsersByIds(client: any, ids: string[]) {
  if (ids.length === 0) return [] as UsuarioItem[];
  const { data, error } = await client
    .from("users")
    .select(
      "id, nome_completo, email, data_nascimento, active, uso_individual, company_id, user_types(name), companies(nome_fantasia)"
    )
    .in("id", ids)
    .or("active.is.null,active.eq.true")
    .or("uso_individual.is.null,uso_individual.eq.false")
    .not("data_nascimento", "is", null)
    .limit(2000);
  if (error) throw error;
  return (data || []) as UsuarioItem[];
}

export async function GET({ request }: { request: Request }) {
  try {
    const authClient = buildAuthClient(request);
    const { data: authData, error: authErr } = await authClient.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const url = new URL(request.url);
    const month = resolveMonth(url.searchParams.get("month"));
    const requestedCompanyIdRaw = String(url.searchParams.get("company_id") || "").trim();
    const requestedCompanyId = isUuid(requestedCompanyIdRaw) ? requestedCompanyIdRaw : "";
    const debugIdRaw = String(url.searchParams.get("debug_id") || "").trim();
    const debugId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      debugIdRaw
    )
      ? debugIdRaw
      : "";

    const { data: usuarioDb, error: usuarioErr } = await authClient
      .from("users")
      .select("id, company_id, uso_individual, user_types(name)")
      .eq("id", user.id)
      .maybeSingle();
    if (usuarioErr) throw usuarioErr;

    const tipoName = String((usuarioDb as any)?.user_types?.name || "").toUpperCase();
    const usoIndividual = Boolean((usuarioDb as any)?.uso_individual);
    const myCompanyId = ((usuarioDb as any)?.company_id as string | null) || null;

    const isAdmin = tipoName.includes("ADMIN");
    const isMaster = tipoName.includes("MASTER");
    const isGestor = tipoName.includes("GESTOR");
    const isVendedor = tipoName.includes("VENDEDOR");

    if (!isAdmin && !isMaster && !isGestor && !isVendedor) {
      return new Response("Sem acesso.", { status: 403 });
    }

    if (usoIndividual) {
      return new Response(JSON.stringify({ month, items: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=60", Vary: "Cookie" },
      });
    }

    const dataClient = hasServiceRoleKey ? supabaseServer : authClient;

    let scopedUsers: UsuarioItem[] = [];

    // Filtro opcional por empresa: respeita a empresa selecionada no dashboard do Master.
    // - ADMIN: pode filtrar por qualquer company_id (escopo admin já é global)
    // - MASTER: só pode filtrar por empresa vinculada (myCompanyId ou master_empresas)
    // - GESTOR/VENDEDOR: só pode filtrar pela própria empresa
    const enforceCompanyFilter = (availableCompanyIds: string[]) => {
      if (!requestedCompanyId) return { ok: true as const };
      if (!availableCompanyIds.includes(requestedCompanyId)) {
        return { ok: false as const };
      }
      scopedUsers = scopedUsers.filter((u) => String(u.company_id || "") === requestedCompanyId);
      return { ok: true as const };
    };

    if (isAdmin) {
      scopedUsers = await fetchUsersByCompanyIds(dataClient, []);
      if (requestedCompanyId) {
        enforceCompanyFilter([requestedCompanyId]);
      }
    } else if (isMaster) {
      const companyIdsFromLinks = await safeFetchMasterCompanyIds(dataClient, user.id);
      const companyIds = Array.from(new Set([...(myCompanyId ? [myCompanyId] : []), ...companyIdsFromLinks]));
      const usersByCompany = companyIds.length > 0 ? await fetchUsersByCompanyIds(dataClient, companyIds) : [];
      const selfUser = await fetchUsersByIds(dataClient, [user.id]);
      scopedUsers = uniqById([...usersByCompany, ...selfUser]);

      if (requestedCompanyId) {
        const result = enforceCompanyFilter(companyIds);
        if (!result.ok) {
          return new Response("company_id fora do escopo do usuário.", { status: 403 });
        }
      }
    } else {
      if (!myCompanyId) {
        return new Response("Seu usuario precisa estar vinculado a uma empresa.", { status: 400 });
      }
      const usersCompany = await fetchUsersByCompanyIds(dataClient, [myCompanyId]);

      // Inclui master(es) responsável(is) pela empresa.
      let masters: UsuarioItem[] = [];
      try {
        const masterIds = await safeFetchMasterIdsForCompany(dataClient, myCompanyId);
        masters = await fetchUsersByIds(dataClient, masterIds);
      } catch (e) {
        // Se não tiver service role e RLS bloquear, apenas segue com usuários da empresa.
        masters = [];
      }

      scopedUsers = uniqById([...usersCompany, ...masters]);

      if (requestedCompanyId && requestedCompanyId !== myCompanyId) {
        return new Response("company_id fora do escopo do usuário.", { status: 403 });
      }
    }

    if (debugId) {
      const candidate = scopedUsers.find((u) => String(u?.id || "") === debugId) || null;

      const { data: rawTarget, error: rawTargetErr } = await dataClient
        .from("users")
        .select(
          "id, data_nascimento, active, uso_individual, company_id, user_types(name)"
        )
        .eq("id", debugId)
        .maybeSingle();
      if (rawTargetErr) throw rawTargetErr;

      const target = (rawTarget as UsuarioItem) || null;
      const targetRole = String((target as any)?.user_types?.name || "");
      const targetCompanyId = ((target as any)?.company_id as string | null) || null;
      const targetActive = (target as any)?.active;
      const targetUsoIndividual = (target as any)?.uso_individual;
      const targetBirth = (target as any)?.data_nascimento as string | null;

      // Scope checks (does not leak PII like nome/email)
      let isMasterLinkedToRequesterCompany = false;
      if ((isGestor || isVendedor) && myCompanyId) {
        const { data: meLink, error: meLinkErr } = await dataClient
          .from("master_empresas")
          .select("id")
          .eq("master_id", debugId)
          .eq("company_id", myCompanyId)
          .neq("status", "rejected")
          .limit(1);
        if (meLinkErr) throw meLinkErr;
        isMasterLinkedToRequesterCompany = Boolean((meLink || []).length);
      }

      const targetRoleAllowed = isRoleAllowed(targetRole);
      const targetMonth = monthOfDate(targetBirth);
      const targetMonthMatches = targetMonth === month;
      const targetIsActive = targetActive == null ? true : Boolean(targetActive);
      const targetIsUsoIndividual = Boolean(targetUsoIndividual);

      const targetInCompanyScope =
        isAdmin ||
        (isMaster
          ? true
          : Boolean(
              myCompanyId &&
                (targetCompanyId === myCompanyId || isMasterLinkedToRequesterCompany)
            ));

      const reasons: string[] = [];
      if (!target) reasons.push("Usuario nao encontrado (ou sem permissao para ler).");
      if (target && !targetInCompanyScope) reasons.push("Fora do escopo da empresa do solicitante.");
      if (target && !targetIsActive) reasons.push("Usuario inativo (active=false).");
      if (target && targetIsUsoIndividual) reasons.push("Usuario marcado como uso_individual.");
      if (target && !targetBirth) reasons.push("Usuario sem data_nascimento preenchida.");
      if (target && targetBirth && !targetMonth) reasons.push("Formato de data_nascimento invalido.");
      if (target && targetMonth != null && !targetMonthMatches)
        reasons.push("Mes do aniversario nao corresponde ao mes consultado.");
      if (target && !targetRoleAllowed) reasons.push("Tipo de usuario nao permitido na lista.");

      const debugPayload = {
        month,
        debugId,
        inScope: Boolean(candidate),
        scopedUsersCount: scopedUsers.length,
        target: target
          ? {
              exists: true,
              company_id: targetCompanyId,
              active: targetActive,
              uso_individual: targetUsoIndividual,
              role: targetRole,
              data_nascimento: targetBirth,
              computed: {
                inCompanyScope: targetInCompanyScope,
                isMasterLinkedToRequesterCompany,
                roleAllowed: targetRoleAllowed,
                monthOfBirth: targetMonth,
                monthMatches: targetMonthMatches,
              },
            }
          : { exists: false },
        requester: {
          id: user.id,
          tipo: tipoName,
          company_id: myCompanyId,
          uso_individual: usoIndividual,
        },
        serviceRole: hasServiceRoleKey,
        reasons,
      };

      return new Response(JSON.stringify(debugPayload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Vary: "Cookie",
        },
      });
    }

    const filtered = scopedUsers
      .filter((u) => isRoleAllowed(String(u.user_types?.name || "")))
      .filter((u) => monthOfDate(u.data_nascimento) === month)
      .sort(sortByDayThenName);

    const payload = {
      month,
      items: filtered.map((u) => ({
        id: u.id,
        nome_completo: u.nome_completo,
        email: u.email,
        data_nascimento: u.data_nascimento,
        role: String(u.user_types?.name || ""),
        company_id: u.company_id,
        company_nome: u.companies?.nome_fantasia || null,
      })),
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=60",
        Vary: "Cookie",
      },
    });
  } catch (e: any) {
    console.error("Erro aniversariantes usuarios:", e);
    return new Response("Erro ao carregar aniversariantes.", { status: 500 });
  }
}
