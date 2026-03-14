import { createServerClient, hasServiceRoleKey, supabaseServer } from "../../../../lib/supabaseServer";
import { titleCaseWithExceptions } from "../../../../lib/titleCase";
import { getSupabaseEnv } from "../../users";

const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

type BodyPayload = {
  cpf?: string | null;
  nome?: string | null;
  nascimento?: string | null;
  endereco?: string | null;
  numero?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  rg?: string | null;
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

function normalizeCpf(value?: string | null) {
  return String(value || "").replace(/\D/g, "");
}

function isRlsInsertError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42501" ||
    message.includes("row-level security") ||
    message.includes("violates row-level security")
  );
}

function isClientesRlsMessage(value: string) {
  const message = String(value || "").toLowerCase();
  if (!message) return false;
  return message.includes("row-level security") && message.includes("clientes");
}

const CLIENTES_RLS_IMPORT_MESSAGE =
  "Nao foi possivel criar o cliente automaticamente por politica de seguranca (RLS). " +
  "Cadastre o cliente em Clientes e tente importar novamente.";

const CLIENTE_SELECT = "id, cpf, nome, nascimento, endereco, numero, cidade, estado, cep, rg";

async function getCompanyId(client: any, userId: string) {
  try {
    const { data, error } = await client.rpc("current_company_id");
    if (!error && data) return String(data);
  } catch {
    // fallback below
  }
  const { data, error } = await client
    .from("users")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.company_id || null;
}

async function ensureClienteCompanyLink(client: any, clienteId: string, companyId: string) {
  const { error } = await client.rpc("ensure_cliente_company_link", {
    p_cliente_id: clienteId,
    p_company_id: companyId,
  });
  if (error) throw error;
}

export async function POST({ request }: { request: Request }) {
  try {
    const authClient = buildAuthClient(request);
    const dataClient = hasServiceRoleKey ? supabaseServer : authClient;

    const { data: authData, error: authErr } = await authClient.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user?.id) return new Response("Sessao invalida.", { status: 401 });

    const body = (await request.json().catch(() => ({}))) as BodyPayload;
    const cpf = normalizeCpf(body?.cpf);
    if (!cpf || cpf.length !== 11) {
      return new Response("CPF invalido para importar contrato.", { status: 400 });
    }

    const companyId = await getCompanyId(authClient, user.id);
    if (!companyId) return new Response("Usuario sem company_id.", { status: 403 });

    const linkByCpfAndRead = async () => {
      const { data: linkedId, error: linkErr } = await authClient.rpc("clientes_link_by_cpf", { p_cpf: cpf });
      if (linkErr) throw linkErr;
      const clienteId = String(linkedId || "").trim();
      if (!clienteId) return null;
      const { data: linkedCliente, error: linkedSelectErr } = await authClient
        .from("clientes")
        .select(CLIENTE_SELECT)
        .eq("id", clienteId)
        .maybeSingle();
      if (linkedSelectErr) throw linkedSelectErr;
      return linkedCliente || null;
    };

    const { data: alreadyVisible, error: alreadyErr } = await authClient
      .from("clientes")
      .select(CLIENTE_SELECT)
      .eq("cpf", cpf)
      .maybeSingle();
    if (alreadyErr) throw alreadyErr;
    if (alreadyVisible) {
      return new Response(JSON.stringify({ cliente: alreadyVisible }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let existingId = "";
    if (hasServiceRoleKey) {
      const { data: foundByCpf, error: foundErr } = await dataClient
        .from("clientes")
        .select("id")
        .eq("cpf", cpf)
        .limit(1)
        .maybeSingle();
      if (foundErr) throw foundErr;
      existingId = String((foundByCpf as any)?.id || "").trim();
      if (existingId) {
        await ensureClienteCompanyLink(dataClient, existingId, companyId);
      }
    } else {
      const linked = await linkByCpfAndRead();
      existingId = String((linked as any)?.id || "").trim();
    }

    if (existingId) {
      const { data: linkedCliente, error: linkedSelectErr } = await authClient
        .from("clientes")
        .select(CLIENTE_SELECT)
        .eq("id", existingId)
        .maybeSingle();
      if (linkedSelectErr) throw linkedSelectErr;
      if (linkedCliente) {
        return new Response(JSON.stringify({ cliente: linkedCliente }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    const basePayload: any = {
      nome: titleCaseWithExceptions(String(body?.nome || "")),
      cpf,
      nascimento: body?.nascimento || null,
      endereco: body?.endereco ? titleCaseWithExceptions(body.endereco) : null,
      numero: body?.numero || null,
      complemento: null,
      cidade: body?.cidade ? titleCaseWithExceptions(body.cidade) : null,
      estado: body?.estado || null,
      cep: body?.cep || null,
      rg: body?.rg || null,
      tipo_cliente: "passageiro",
      ativo: true,
      active: true,
    };
    const compatPayloads: any[] = [
      { ...basePayload, created_by: user.id, company_id: companyId },
      { ...basePayload, created_by: null, company_id: companyId },
      { ...basePayload, created_by: user.id },
      { ...basePayload, created_by: null },
    ];

    let lastInsertError: any = null;
    for (const payload of compatPayloads) {
      const { data: inserted, error } = await dataClient
        .from("clientes")
        .insert(payload)
        .select(CLIENTE_SELECT)
        .single();
      if (!error) {
        if (hasServiceRoleKey && (inserted as any)?.id) {
          await ensureClienteCompanyLink(dataClient, String((inserted as any).id), companyId);
        }
        return new Response(JSON.stringify({ cliente: inserted }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      lastInsertError = error;

      if (String(error?.code || "") === "23505") {
        const linked = await linkByCpfAndRead();
        if (linked) {
          return new Response(JSON.stringify({ cliente: linked }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      if (isRlsInsertError(error)) {
        const linked = await linkByCpfAndRead().catch(() => null);
        if (linked) {
          return new Response(JSON.stringify({ cliente: linked }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }

    if (lastInsertError) throw lastInsertError;
    return new Response("Nao foi possivel resolver cliente.", { status: 500 });
  } catch (error: any) {
    const message = String(error?.message || "Erro ao resolver cliente para importacao.");
    if (isRlsInsertError(error) || isClientesRlsMessage(message)) {
      return new Response(CLIENTES_RLS_IMPORT_MESSAGE, { status: 403 });
    }
    return new Response(message, { status: 500 });
  }
}
