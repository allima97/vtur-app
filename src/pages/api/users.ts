import { supabaseServer, createServerClient, hasServiceRoleKey, readEnv } from "../../lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { MODULOS_MASTER_PERMISSOES } from "../../config/modulos";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { renderEmailHtml, renderEmailText } from "../../lib/emailMarkdown";
import {
  buildFromEmails,
  resolveFromEmails,
  resolveResendApiKey,
  resolveSmtpConfig,
} from "../../lib/emailSettings";


export function getSupabaseEnv(request?: Request) {
  // Prefer readEnv to support Workers bindings at module scope.
  let url = readEnv("PUBLIC_SUPABASE_URL") || readEnv("SUPABASE_URL");
  let anon = readEnv("PUBLIC_SUPABASE_ANON_KEY") || readEnv("SUPABASE_ANON_KEY");

  // Cloudflare Workers (D1/Pages Functions) may expose env on request.
  if ((!url || !anon) && request && "env" in request) {
    // @ts-ignore
    url = url || request.env.PUBLIC_SUPABASE_URL || request.env.SUPABASE_URL;
    // @ts-ignore
    anon = anon || request.env.PUBLIC_SUPABASE_ANON_KEY || request.env.SUPABASE_ANON_KEY;
  }

  return { supabaseUrl: url, supabaseAnonKey: anon };
}

type BodyPayload = {
  id?: string | null;
  email?: string | null;
  password?: string | null;
  user_type_id?: string | null;
  nome_completo?: string | null;
  uso_individual?: boolean | null;
  company_id?: string | null;
  active?: boolean | null;
  created_by_gestor?: boolean | null;
};

type ConvitePayload = {
  invited_user_id: string;
  invited_email: string;
  company_id: string;
  user_type_id?: string | null;
  invited_by: string;
  invited_by_role: "ADMIN" | "MASTER" | "GESTOR";
  status: "pending";
};

type AuthCreateResult = {
  userId: string;
  mode: "admin_create_user" | "signup_fallback" | "existing_user";
};

const ALERTA_FROM_EMAIL = readEnv("ALERTA_FROM_EMAIL");
const SENDGRID_API_KEY = readEnv("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = readEnv("SENDGRID_FROM_EMAIL");
const TEMPLATE_BEM_VINDO_NOME = "Bem-Vindo!";
const TEMPLATE_BEM_VINDO_ASSUNTO = "Bem-Vindo!";
const TEMPLATE_CONVITE_NOME = "Convite de Acesso";
const TEMPLATE_CONVITE_ASSUNTO = "Convite de Acesso";
const RATE_LIMIT_REGEX = /rate limit|too many requests/i;

const MODULOS_PADRAO_VENDEDOR = [
  "Dashboard",
  "Vendas",
  "Clientes",
  "Produtos",
  "Consultoria",
  "Consultoria Online",
];
const PERMISSAO_PADRAO_VENDEDOR = "admin";
const MODULOS_PADRAO_MASTER = [
  ...MODULOS_MASTER_PERMISSOES,
  "MasterEmpresas",
  "MasterUsuarios",
  "MasterPermissoes",
];
const PERMISSAO_PADRAO_MASTER = "delete";

function normalizeNomeCompleto(value?: string | null) {
  if (value === undefined) return undefined;
  const normalized = titleCaseWithExceptions(value || "");
  return normalized ? normalized : null;
}

async function garantirPermissoesPadrao(
  usuarioId: string,
  permissaoPadrao: string = PERMISSAO_PADRAO_VENDEDOR,
  client: any = supabaseServer
) {
  const { data: existente, error: selectError } = await client
    .from("modulo_acesso")
    .select("modulo")
    .eq("usuario_id", usuarioId);

  if (selectError) throw selectError;

  const modulosExistentes = new Set(
    (existente ?? []).map((item) => (item.modulo || "").toLowerCase())
  );

  const modulosParaInserir = MODULOS_PADRAO_VENDEDOR.filter(
    (modulo) => !modulosExistentes.has(modulo.toLowerCase())
  );

  if (!modulosParaInserir.length) return;

  const rows = modulosParaInserir.map((modulo) => ({
    usuario_id: usuarioId,
    modulo,
    permissao: permissaoPadrao,
    ativo: true,
  }));

  const { error: insertError } = await client.from("modulo_acesso").insert(rows);
  if (insertError) throw insertError;
}

async function garantirPermissoesMaster(usuarioId: string, client: any = supabaseServer) {
  const { data: existente, error: selectError } = await client
    .from("modulo_acesso")
    .select("modulo")
    .eq("usuario_id", usuarioId);

  if (selectError) throw selectError;

  const modulosExistentes = new Set(
    (existente ?? []).map((item) => (item.modulo || "").toLowerCase())
  );

  const modulosParaInserir = MODULOS_PADRAO_MASTER.filter(
    (modulo) => !modulosExistentes.has(modulo.toLowerCase())
  );

  if (!modulosParaInserir.length) return;

  const rows = modulosParaInserir.map((modulo) => ({
    usuario_id: usuarioId,
    modulo,
    permissao: PERMISSAO_PADRAO_MASTER,
    ativo: true,
  }));

  const { error: insertError } = await client.from("modulo_acesso").insert(rows);
  if (insertError) throw insertError;
}

async function isUsuarioMaster(usuarioId: string, client: any = supabaseServer) {
  const tipo = await getUserTypeNameByUserId(usuarioId, client);
  if (tipo.includes("MASTER")) return true;

  const { data, error } = await client
    .from("master_empresas")
    .select("id")
    .eq("master_id", usuarioId)
    .neq("status", "rejected")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function getCompanyIdFromUser(usuarioId: string) {
  const { data, error } = await supabaseServer
    .from("users")
    .select("company_id")
    .eq("id", usuarioId)
    .maybeSingle();
  if (error) throw error;
  return ((data as any)?.company_id as string | null) || null;
}

async function getUserTypeNameById(userTypeId?: string | null, client: any = supabaseServer) {
  if (!userTypeId) return "";
  const { data, error } = await client
    .from("user_types")
    .select("name")
    .eq("id", userTypeId)
    .maybeSingle();
  if (error) throw error;
  return String((data as any)?.name || "").toUpperCase();
}

async function getUserTypeNameByUserId(userId: string, client: any = supabaseServer) {
  const { data, error } = await client
    .from("users")
    .select("user_type_id, user_types(name)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;

  const embeddedName = String((data as any)?.user_types?.name || "").toUpperCase();
  if (embeddedName) return embeddedName;

  const userTypeId = (data as any)?.user_type_id as string | null;
  if (!userTypeId) return "";

  return await getUserTypeNameById(userTypeId, client);
}

function isTableMissing(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || message.includes("does not exist");
}

function isRlsViolation(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42501" || message.includes("row-level security");
}

function isPolicyRecursion(error: any) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("infinite recursion detected in policy");
}

function isRateLimit(error: any) {
  const message = String(error?.message || error || "").toLowerCase();
  return RATE_LIMIT_REGEX.test(message);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getExistingAuthUserId(email: string): Promise<string | null> {
  if (!hasServiceRoleKey) return null;
  const normalized = email.trim().toLowerCase();
  try {
    // Supabase Auth Admin API nao expõe getUserByEmail; usamos paginação e filtramos.
    const perPage = 1000;
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await supabaseServer.auth.admin.listUsers({ page, perPage });
      if (error) {
        if (isRateLimit(error)) throw error;
        return null;
      }
      const users = (data as any)?.users || [];
      const found = users.find((u: any) => String(u?.email || "").trim().toLowerCase() === normalized);
      if (found?.id) return String(found.id);
      if (users.length < perPage) break; // ultima pagina
    }
    return null;
  } catch (err: any) {
    if (isRateLimit(err)) throw err;
    return null;
  }
}

async function inviteAuthUser(email: string): Promise<AuthCreateResult> {
  if (!hasServiceRoleKey) {
    throw new Error("Invite requer SUPABASE_SERVICE_ROLE_KEY configurada.");
  }
  const { data, error } = await supabaseServer.auth.admin.inviteUserByEmail(email);
  if (error) throw error;
  const userId = data?.user?.id || "";
  if (!userId) throw new Error("Falha ao criar convite de autenticacao.");
  return { userId, mode: "admin_invite" };
}

async function hasPendingInvite(companyId: string, email: string, client: any = supabaseServer) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await client
    .from("user_convites")
    .select("id")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .ilike("invited_email", normalizedEmail)
    .maybeSingle();

  if (error) {
    if (isTableMissing(error)) return false;
    throw error;
  }
  return Boolean(data?.id);
}

async function createInviteWithClient(payload: ConvitePayload, client: any = supabaseServer) {
  const { error } = await client.from("user_convites").insert(payload);
  if (error) {
    if (isTableMissing(error)) return;
    throw error;
  }
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

function buildAuthClient(request: Request) {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv(request);
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "PUBLIC_SUPABASE_URL/SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY nao configurados."
    );
  }

  const authHeader = String(request.headers.get("authorization") || "").trim();
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const accessToken = bearerMatch?.[1]?.trim() || "";

  if (accessToken) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
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

function resolveRoleFromAuthMetadata(user: any) {
  const metadataRole = String(
      user?.app_metadata?.tipo_usuario ||
      user?.app_metadata?.role ||
      ""
  ).toUpperCase();
  const metadataCompanyId = String(user?.app_metadata?.company_id || "").trim();

  return {
    isAdmin: metadataRole.includes("ADMIN"),
    isMaster: metadataRole.includes("MASTER"),
    isGestor: metadataRole.includes("GESTOR"),
    companyId: metadataCompanyId || null,
  };
}

async function getRequesterAccess(request: Request, userId: string) {
  const authClient = buildAuthClient(request);

  let tipo = "";
  let companyId: string | null = null;

  const { data: selfData, error: selfErr } = await authClient
    .from("users")
    .select("id, user_type_id, company_id, user_types(name)")
    .eq("id", userId)
    .maybeSingle();

  if (!selfErr && selfData) {
    tipo = String((selfData as any)?.user_types?.name || "").toUpperCase();
    companyId = ((selfData as any)?.company_id as string | null) || null;
    if (!tipo) {
      const fallbackTipo = await getUserTypeNameById((selfData as any)?.user_type_id || null);
      tipo = String(fallbackTipo || "").toUpperCase();
    }
  } else {
    tipo = await getUserTypeNameByUserId(userId);
    companyId = await getCompanyIdFromUser(userId);
  }

  const isAdmin = tipo.includes("ADMIN");
  let isMaster = tipo.includes("MASTER");
  const isGestor = tipo.includes("GESTOR");

  if (!isMaster) {
    const { data: vinculoMaster, error: vincErr } = await authClient
      .from("master_empresas")
      .select("id")
      .eq("master_id", userId)
      .neq("status", "rejected")
      .limit(1)
      .maybeSingle();

    if (!vincErr && vinculoMaster?.id) {
      isMaster = true;
    } else if (vincErr) {
      const fallbackMaster = await isUsuarioMaster(userId);
      isMaster = isMaster || fallbackMaster;
    }
  }

  let hasMasterModulo = false;
  const { data: moduloRows, error: moduloErr } = await authClient
    .from("modulo_acesso")
    .select("modulo, ativo")
    .eq("usuario_id", userId)
    .in("modulo", ["MasterUsuarios", "MasterPermissoes", "MasterEmpresas", "masterusuarios", "masterpermissoes", "masterempresas"]);

  if (!moduloErr) {
    hasMasterModulo = Boolean(
      (moduloRows || []).find((row: any) => row?.ativo !== false)
    );
  }

  const isMasterFinal = isMaster || hasMasterModulo;

  return {
    isAdmin,
    isMaster: isMasterFinal,
    isGestor: !isAdmin && !isMasterFinal && isGestor,
    companyId,
  };
}

async function createAuthUserForOperatorFlow(
  email: string,
  password: string,
  authClient: any
): Promise<AuthCreateResult> {
  // Se já existe usuário no Auth, reutiliza para evitar rate limit de e-mail
  try {
    const existingId = await getExistingAuthUserId(email);
    if (existingId) {
      return { userId: existingId, mode: "existing_user" };
    }
  } catch (checkErr: any) {
    if (isRateLimit(checkErr)) {
      throw new Error("Limite de e-mails excedido no Supabase. Aguarde 1 minuto e tente novamente.");
    }
  }

  const backoff = async (attempt: number) => {
    const delay = Math.min(32000, 1000 * Math.pow(2, attempt)); // 1s,2s,4s,8s,16s,32s máx ~1 min
    await sleep(delay);
  };

  const tryAdminCreate = async () => {
    const { data: authCreated, error: authErr } = await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr) throw authErr;
    const userId = authCreated.user?.id || "";
    if (!userId) throw new Error("Falha ao criar autenticacao.");
    return { userId, mode: "admin_create_user" } as AuthCreateResult;
  };

  if (hasServiceRoleKey) {
    let lastErr: any = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        return await tryAdminCreate();
      } catch (authErr: any) {
        lastErr = authErr;
        const msg = String(authErr?.message || "");
        if (isRateLimit(authErr)) {
          // tenta reaproveitar se alguém criou em paralelo
          const reused = await getExistingAuthUserId(email);
          if (reused) return { userId: reused, mode: "existing_user" };
          if (attempt < 5) {
            await backoff(attempt);
            continue;
          }
          // última cartada: enviar convite administrativo (gera usuário e link)
          try {
            return await inviteAuthUser(email);
          } catch (inviteErr: any) {
            if (!isRateLimit(inviteErr)) {
              throw new Error(`Falha ao criar autenticacao (convite): ${inviteErr?.message || inviteErr}`);
            }
          }
          break;
        }
        if (msg.toLowerCase().includes("already")) {
          const reused = await getExistingAuthUserId(email);
          if (reused) return { userId: reused, mode: "existing_user" };
          throw new Error("Este e-mail ja esta cadastrado.");
        }
        if (!msg.toLowerCase().includes("user not allowed")) {
          throw new Error(`Falha ao criar autenticacao: ${msg || "erro desconhecido"}`);
        }
        // 'user not allowed' -> segue para signup
        break;
      }
    }
  }

  const { data: signUpData, error: signUpErr } = await authClient.auth.signUp({
    email,
    password,
  });
  if (signUpErr) {
    const msg = String(signUpErr.message || "");
    if (isRateLimit(signUpErr)) {
      if (hasServiceRoleKey) {
        // Uma última rodada de admin create com backoff curto
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await tryAdminCreate();
          } catch (adminErr: any) {
            if (isRateLimit(adminErr)) {
              const reused = await getExistingAuthUserId(email);
              if (reused) return { userId: reused, mode: "existing_user" };
              if (attempt < 2) {
                await backoff(attempt);
                continue;
              }
              try {
                return await inviteAuthUser(email);
              } catch (inviteErr: any) {
                if (!isRateLimit(inviteErr)) {
                  throw new Error(`Falha ao criar autenticacao (convite): ${inviteErr?.message || inviteErr}`);
                }
              }
            }
          }
        }
      }
      const reused = await getExistingAuthUserId(email);
      if (reused) return { userId: reused, mode: "existing_user" };
      throw new Error("Limite de e-mails excedido no Supabase. Aguarde alguns minutos e tente novamente.");
    }
    if (msg.toLowerCase().includes("already")) {
      // Tenta reutilizar o usuário já existente no Auth
      const reused = await getExistingAuthUserId(email);
      if (reused) return { userId: reused, mode: "existing_user" };
      throw new Error("Este e-mail ja esta cadastrado.");
    }
    throw new Error(`Falha ao criar autenticacao: ${msg || "erro desconhecido"}`);
  }
  const userId = signUpData.user?.id || "";
  if (!userId) throw new Error("Falha ao criar autenticacao.");
  return { userId, mode: "signup_fallback" };
}

async function isRestrictedUserType(userTypeId: string) {
  const { data, error } = await supabaseServer
    .from("user_types")
    .select("id, name")
    .eq("id", userTypeId)
    .maybeSingle();
  if (error) throw error;
  const nome = String((data as any)?.name || "").toUpperCase();
  return nome.includes("ADMIN") || nome.includes("MASTER");
}

async function masterCanAccessCompany(masterId: string, companyId: string) {
  const { data, error } = await supabaseServer
    .from("master_empresas")
    .select("id")
    .eq("master_id", masterId)
    .eq("company_id", companyId)
    .neq("status", "rejected")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function masterCanAccessCompanyByRequest(
  request: Request,
  masterId: string,
  companyId: string
) {
  const authClient = buildAuthClient(request);
  const { data, error } = await authClient
    .from("master_empresas")
    .select("id")
    .eq("master_id", masterId)
    .eq("company_id", companyId)
    .neq("status", "rejected")
    .maybeSingle();

  if (!error && data?.id) return true;

  const { data: userData, error: userErr } = await authClient
    .from("users")
    .select("company_id")
    .eq("id", masterId)
    .maybeSingle();
  if (!userErr && String((userData as any)?.company_id || "") === String(companyId || "")) {
    return true;
  }

  return await masterCanAccessCompany(masterId, companyId);
}

function applyTemplate(text: string, vars: Record<string, string>) {
  return text
    .replace(/{{\s*nome\s*}}/gi, vars.nome || "")
    .replace(/{{\s*email\s*}}/gi, vars.email || "")
    .replace(/{{\s*empresa\s*}}/gi, vars.empresa || "")
    .replace(/{{\s*senha\s*}}/gi, vars.senha || "");
}

async function enviarEmailResend(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
  apiKey?: string;
}) {
  const fromEmail = params.fromEmail || ALERTA_FROM_EMAIL;
  const key = params.apiKey;
  if (!key || !fromEmail) {
    return { ok: false, status: "resend_not_configured" };
  }
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    console.error("Erro Resend:", resp.status, data);
    return { ok: false, status: String(resp.status), error: data };
  }
  if (!data?.id) {
    console.error("Resposta Resend sem ID:", data);
    return { ok: false, status: "resend_invalid_response", error: data };
  }
  return { ok: true, status: String(resp.status), id: data?.id };
}

async function enviarEmailSendGrid(params: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  fromEmail?: string;
}) {
  const fromEmail = params.fromEmail || SENDGRID_FROM_EMAIL || ALERTA_FROM_EMAIL;
  if (!SENDGRID_API_KEY || !fromEmail) {
    return { ok: false, status: "sendgrid_not_configured" };
  }
  const personalizations = params.to.map((dest) => ({ to: [{ email: dest }] }));
  const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations,
      from: { email: fromEmail },
      subject: params.subject,
      content: [
        { type: "text/plain", value: params.text },
        { type: "text/html", value: params.html },
      ],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error("Erro SendGrid:", resp.status, errText);
    return { ok: false, status: String(resp.status) };
  }
  return { ok: true, status: String(resp.status) };
}

async function enviarEmailSMTP(
  params: { to: string[]; subject: string; html: string; text: string },
  smtpConfig: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string },
  fromEmail?: string
) {
  if (!smtpConfig.host || !smtpConfig.user || !smtpConfig.pass) {
    return { ok: false, status: "smtp_not_configured" };
  }
  // Cloudflare Workers nao suportam SMTP (TCP). Use Resend/SendGrid.
  void params;
  void fromEmail;
  return { ok: false, status: "smtp_not_supported" };
}

async function marcarWelcomeEmailEnviado(userId: string) {
  const { error } = await supabaseServer
    .from("users")
    .update({ welcome_email_sent: true })
    .eq("id", userId);
  if (error) {
    console.warn("Falha ao marcar welcome_email_sent:", error.message);
  }
}

async function enviarTemplateBoasVindas(params: {
  userId: string;
  email: string;
  nomeCompleto?: string | null;
  companyId?: string | null;
  senhaTemporaria?: string | null;
}) {
  const toEmail = String(params.email || "").trim();
  if (!toEmail) return;

  const preferredTemplateName = params.senhaTemporaria ? TEMPLATE_CONVITE_NOME : TEMPLATE_BEM_VINDO_NOME;
  const preferredTemplateSubject = params.senhaTemporaria
    ? TEMPLATE_CONVITE_ASSUNTO
    : TEMPLATE_BEM_VINDO_ASSUNTO;

  const { data: templateByName, error: templateNameErr } = await supabaseServer
    .from("admin_avisos_templates")
    .select("id, nome, assunto, mensagem, ativo, sender_key")
    .eq("nome", preferredTemplateName)
    .limit(1)
    .maybeSingle();

  if (templateNameErr) {
    console.warn("Falha ao consultar template Bem-Vindo! por nome:", templateNameErr.message);
  }

  let template = templateByName as any;
  if (!template) {
    const { data: templateBySubject, error: templateSubjectErr } = await supabaseServer
      .from("admin_avisos_templates")
      .select("id, nome, assunto, mensagem, ativo, sender_key")
      .eq("assunto", preferredTemplateSubject)
      .limit(1)
      .maybeSingle();
    if (templateSubjectErr) {
      console.warn("Falha ao consultar template Bem-Vindo! por assunto:", templateSubjectErr.message);
    }
    template = templateBySubject as any;
  }

  if (!template?.id) {
    if (params.senhaTemporaria) {
      const { data: fallbackTemplate } = await supabaseServer
        .from("admin_avisos_templates")
        .select("id, nome, assunto, mensagem, ativo, sender_key")
        .eq("nome", TEMPLATE_BEM_VINDO_NOME)
        .limit(1)
        .maybeSingle();
      template = fallbackTemplate as any;
    }
  }

  if (!template?.id) {
    console.warn("Template de boas-vindas/convite nao encontrado. Envio ignorado.");
    return;
  }
  if (!template.ativo) {
    console.warn("Template Bem-Vindo! inativo. Envio ignorado.");
    return;
  }

  let empresaNome = "";
  const companyId = String(params.companyId || "").trim();
  if (companyId) {
    const { data: companyData } = await supabaseServer
      .from("companies")
      .select("nome_fantasia")
      .eq("id", companyId)
      .maybeSingle();
    empresaNome = String((companyData as any)?.nome_fantasia || "");
  }

  const vars = {
    nome: params.nomeCompleto || "",
    email: toEmail,
    empresa: empresaNome,
    senha: params.senhaTemporaria || "",
  };

  const subject = applyTemplate(String(template.assunto || TEMPLATE_BEM_VINDO_ASSUNTO), vars);
  const raw = applyTemplate(String(template.mensagem || ""), vars);
  const text = renderEmailText(raw);
  const html = renderEmailHtml(raw);

  const { data: settings } = await supabaseServer
    .from("admin_email_settings")
    .select(
      "resend_api_key, alerta_from_email, admin_from_email, avisos_from_email, financeiro_from_email, suporte_from_email, smtp_user"
    )
    .eq("singleton", true)
    .maybeSingle();

  const smtpConfig = await resolveSmtpConfig();
  const fromEmails = settings ? buildFromEmails(settings as any) : await resolveFromEmails();
  const resendApiKey = String((settings as any)?.resend_api_key || "").trim() || (await resolveResendApiKey());
  const senderKey = String(template?.sender_key || "avisos").toLowerCase();
  const fromEmail =
    (senderKey === "financeiro"
      ? fromEmails.financeiro
      : senderKey === "suporte"
        ? fromEmails.suporte
        : senderKey === "admin"
          ? fromEmails.admin
          : fromEmails.avisos) || fromEmails.default || smtpConfig.from;

  const to = [toEmail];

  const resendResp = await enviarEmailResend({
    to,
    subject,
    html,
    text,
    fromEmail,
    apiKey: resendApiKey,
  });
  if (resendResp.ok) {
    await marcarWelcomeEmailEnviado(params.userId);
    return;
  }

  const sendgridResp = await enviarEmailSendGrid({ to, subject, html, text, fromEmail });
  if (sendgridResp.ok) {
    await marcarWelcomeEmailEnviado(params.userId);
    return;
  }

  const smtpResp = await enviarEmailSMTP({ to, subject, html, text }, smtpConfig, fromEmail);
  if (smtpResp.ok) {
    await marcarWelcomeEmailEnviado(params.userId);
    return;
  }

  console.warn("Nao foi possivel enviar e-mail de boas-vindas para:", toEmail);
}

export async function POST({ request }: { request: Request }) {
  try {
    const requestUser = await getUserFromRequest(request);
    if (!requestUser) return new Response("Sessao invalida.", { status: 401 });
    const authClient = buildAuthClient(request);
    const dbWriteClient: any = authClient;

    const body = (await request.json()) as BodyPayload;
    let userId = body.id?.trim() || "";
    const email = body.email?.trim().toLowerCase();
    const password = body.password || "";

    // Update mínimo (ex: toggle ativo/inativo) deve funcionar sem enviar email/company/user_type,
    // para evitar limpar campos por acidente e para reduzir chances de RLS/constraints.
    const isActiveOnlyUpdate =
      Boolean(userId) &&
      typeof body.active === "boolean" &&
      !body.password &&
      body.user_type_id === undefined &&
      body.company_id === undefined &&
      body.nome_completo === undefined &&
      body.uso_individual === undefined &&
      body.created_by_gestor === undefined;

    if (isActiveOnlyUpdate) {
      let requesterAccess = await getRequesterAccess(request, requestUser.id);
      if (!requesterAccess.isAdmin && !requesterAccess.isMaster && !requesterAccess.isGestor) {
        const metaAccess = resolveRoleFromAuthMetadata(requestUser);
        if (metaAccess.isAdmin || metaAccess.isMaster || metaAccess.isGestor) {
          requesterAccess = {
            isAdmin: metaAccess.isAdmin,
            isMaster: !metaAccess.isAdmin && metaAccess.isMaster,
            isGestor: !metaAccess.isAdmin && !metaAccess.isMaster && metaAccess.isGestor,
            companyId: requesterAccess.companyId ?? metaAccess.companyId,
          };
        }
      }

      const isAdmin = requesterAccess.isAdmin;
      const isSelf = requestUser.id === userId;
      const isMaster = !isAdmin ? requesterAccess.isMaster : false;
      const isGestor = !isAdmin && !isMaster ? requesterAccess.isGestor : false;

      if (!isAdmin && !isSelf && !isMaster && !isGestor) {
        return new Response("Sem permissao para atualizar usuario.", { status: 403 });
      }

      // Valida escopo para master/gestor olhando a empresa do usuário alvo.
      // Importante: Admin/Self não precisam ler o usuário-alvo para dar toggle.
      const needsScopeCheck = !isSelf && (isMaster || isGestor);
      let targetCompanyId: string | null = null;
      let targetUserTypeId: string | null = null;
      if (needsScopeCheck) {
        const { data: target, error: targetError } = await authClient
          .from("users")
          .select("id, company_id, user_type_id")
          .eq("id", userId)
          .maybeSingle();

        if (targetError) {
          if (hasServiceRoleKey && isRlsViolation(targetError)) {
            const { data: privilegedTarget, error: privilegedTargetError } = await supabaseServer
              .from("users")
              .select("id, company_id, user_type_id")
              .eq("id", userId)
              .maybeSingle();
            if (privilegedTargetError) throw privilegedTargetError;
            targetCompanyId = ((privilegedTarget as any)?.company_id as string | null) || null;
            targetUserTypeId = ((privilegedTarget as any)?.user_type_id as string | null) || null;
          } else if (isRlsViolation(targetError) && !hasServiceRoleKey) {
            return new Response("Sem permissao para ler usuario alvo (RLS).", { status: 403 });
          } else {
            throw targetError;
          }
        } else {
          targetCompanyId = ((target as any)?.company_id as string | null) || null;
          targetUserTypeId = ((target as any)?.user_type_id as string | null) || null;
        }
      }

      if (needsScopeCheck) {
        if (isMaster) {
          if (!targetCompanyId) return new Response("Usuario sem empresa vinculada.", { status: 400 });
          const podeAcessar = await masterCanAccessCompanyByRequest(
            request,
            requestUser.id,
            targetCompanyId
          );
          if (!podeAcessar) return new Response("Empresa fora do seu portfolio.", { status: 403 });
        }
        if (isGestor) {
          const companyIdGestor = requesterAccess.companyId ?? (await getCompanyIdFromUser(requestUser.id));
          if (!companyIdGestor || !targetCompanyId || companyIdGestor !== targetCompanyId) {
            return new Response("Gestor so pode atualizar usuarios da propria empresa.", {
              status: 403,
            });
          }

          // Mantém o mesmo critério do fluxo de criação: gestor só gerencia vendedores.
          const tipoNome = await getUserTypeNameById(targetUserTypeId);
          if (!tipoNome.includes("VENDEDOR")) {
            return new Response("Gestor so pode atualizar usuarios do tipo VENDEDOR.", {
              status: 403,
            });
          }
        }
      }

      let updateError: any = null;
      {
        const { error } = await dbWriteClient
          .from("users")
          .update({ active: body.active })
          .eq("id", userId);
        updateError = error || null;
      }

      if (updateError && hasServiceRoleKey && (isRlsViolation(updateError) || isPolicyRecursion(updateError))) {
        const { error: privilegedUpdateError } = await supabaseServer
          .from("users")
          .update({ active: body.active })
          .eq("id", userId);
        updateError = privilegedUpdateError || null;
      }

      if (updateError) {
        const code = String(updateError?.code || "");
        const msg = String(updateError?.message || updateError);
        const status = code === "42501" || isRlsViolation(updateError) ? 403 : 500;
        return new Response(`Falha ao atualizar status: ${msg}`, { status });
      }

      return Response.json({ id: userId, updated: true }, { status: 200 });
    }

    if (!email) return new Response("E-mail e obrigatorio.", { status: 400 });

    let requesterAccess = await getRequesterAccess(request, requestUser.id);
    if (!requesterAccess.isAdmin && !requesterAccess.isMaster && !requesterAccess.isGestor) {
      const metaAccess = resolveRoleFromAuthMetadata(requestUser);
      if (metaAccess.isAdmin || metaAccess.isMaster || metaAccess.isGestor) {
        requesterAccess = {
          isAdmin: metaAccess.isAdmin,
          isMaster: !metaAccess.isAdmin && metaAccess.isMaster,
          isGestor: !metaAccess.isAdmin && !metaAccess.isMaster && metaAccess.isGestor,
          companyId: requesterAccess.companyId ?? metaAccess.companyId,
        };
      }
    }
    const isAdmin = requesterAccess.isAdmin;
    const isSelf = Boolean(userId) && requestUser.id === userId;
    const isMaster = !isAdmin ? requesterAccess.isMaster : false;
    const isGestor = !isAdmin && !isMaster ? requesterAccess.isGestor : false;

    const payload: Record<string, any> = {};
    const setIfDefined = (key: string, value: any) => {
      if (value !== undefined) payload[key] = value;
    };
    const setNomeCompleto = (value?: string | null) => {
      const normalized = normalizeNomeCompleto(value);
      if (normalized !== undefined) payload.nome_completo = normalized;
    };

    if (!isAdmin) {
      if (!isSelf && !isMaster && !isGestor) {
        return new Response(
          `Sem permissao para atualizar usuario. Perfil atual: admin=${isAdmin}, master=${isMaster}, gestor=${isGestor}.`,
          { status: 403 }
        );
      }

      if (!isSelf) {
        if (!body.company_id) {
          return new Response("Empresa e obrigatoria para criar usuario corporativo.", { status: 400 });
        }
        if (isMaster) {
          const podeAcessar = await masterCanAccessCompanyByRequest(
            request,
            requestUser.id,
            body.company_id
          );
          if (!podeAcessar) return new Response("Empresa fora do seu portfolio.", { status: 403 });
        }
        if (isGestor) {
          const companyIdGestor = requesterAccess.companyId ?? (await getCompanyIdFromUser(requestUser.id));
          if (!companyIdGestor || companyIdGestor !== body.company_id) {
            return new Response("Gestor so pode criar usuarios da propria empresa.", {
              status: 403,
            });
          }
        }

        if (body.user_type_id && (await isRestrictedUserType(body.user_type_id))) {
          return new Response("Tipo de usuario nao permitido.", { status: 403 });
        }
        if (isGestor) {
          const tipoNome = await getUserTypeNameById(body.user_type_id);
          if (!tipoNome.includes("VENDEDOR")) {
            return new Response("Gestor so pode criar usuarios do tipo VENDEDOR.", {
              status: 403,
            });
          }
        }

        setNomeCompleto(body.nome_completo);
        setIfDefined("user_type_id", body.user_type_id ?? null);
        setIfDefined("company_id", body.company_id);
        setIfDefined("active", body.active ?? true);
        payload.uso_individual = false;
        payload.created_by_gestor = isGestor;
      } else {
        const { data: existente, error } = await authClient
          .from("users")
          .select("id, company_id, uso_individual, created_by_gestor")
          .eq("id", userId)
          .maybeSingle();
        if (error) throw error;

        const bloqueiaUso =
          Boolean((existente as any)?.created_by_gestor) ||
          (Boolean((existente as any)?.company_id) && (existente as any)?.uso_individual === false);

        setNomeCompleto(body.nome_completo);
        if (!bloqueiaUso && typeof body.uso_individual === "boolean") {
          payload.uso_individual = body.uso_individual;
        }
      }
    } else {
      setIfDefined("user_type_id", body.user_type_id ?? null);
      setNomeCompleto(body.nome_completo);
      if (typeof body.uso_individual === "boolean") {
        payload.uso_individual = body.uso_individual;
      }
      setIfDefined("company_id", body.company_id ?? null);
      setIfDefined("active", body.active ?? true);
      if (body.created_by_gestor !== undefined) {
        payload.created_by_gestor = body.created_by_gestor;
      }
    }

    const companyIdTarget = String(payload.company_id || body.company_id || "").trim();
    const fluxoCorporativoNovo =
      !isSelf && Boolean(companyIdTarget) && payload.uso_individual === false;
    const tentativaCriacao = !userId;
    const criadoPorOperador = !isSelf && (isAdmin || isMaster || isGestor);
    if (fluxoCorporativoNovo && companyIdTarget && tentativaCriacao) {
      const jaExisteConvite = await hasPendingInvite(companyIdTarget, email, authClient);
      if (jaExisteConvite) {
        return new Response(
          "Ja existe um convite pendente para este e-mail nesta empresa.",
          { status: 409 }
        );
      }
    }

    let createdAuthUserId: string | null = null;
    let authCreateMode: AuthCreateResult["mode"] | null = null;
    if (!userId) {
      if (!password || password.length < 6) {
        return new Response("Senha obrigatoria (minimo 6 caracteres).", { status: 400 });
      }
      try {
        const authCreate = await createAuthUserForOperatorFlow(email, password, authClient);
        userId = authCreate.userId;
        authCreateMode = authCreate.mode;
      } catch (err: any) {
        const msg = String(err?.message || "Falha ao criar autenticacao.");
        if (msg.toLowerCase().includes("ja esta cadastrado")) {
          return new Response(msg, { status: 409 });
        }
        return new Response(msg, { status: 500 });
      }

      createdAuthUserId = userId || null;
      if (!userId) return new Response("Falha ao criar autenticacao.", { status: 500 });
      if (authCreateMode === "existing_user" || authCreateMode === "admin_invite") {
        createdAuthUserId = null; // não deletar usuário já existente em rollback
      }
    }

    let usuarioExistente = null as { id: string } | null;
    {
      const { data: existente, error: existeError } = await dbWriteClient
        .from("users")
        .select("id")
        .eq("id", userId)
        .maybeSingle();
      if (existeError) throw existeError;
      usuarioExistente = (existente as any) || null;
    }

    payload.id = userId;
    payload.email = email;
    if (tentativaCriacao && criadoPorOperador) {
      payload.must_change_password = true;
    }

    let persistError: any = null;
    {
      const { error } = await dbWriteClient.from("users").upsert(payload);
      persistError = error || null;
    }

    if (persistError && hasServiceRoleKey && isRlsViolation(persistError)) {
      const { error: privilegedPersistError } = await supabaseServer
        .from("users")
        .upsert(payload);
      persistError = privilegedPersistError || null;
    }

    if (persistError) {
      if (createdAuthUserId) {
        try {
          if (authCreateMode === "admin_create_user") {
            await supabaseServer.auth.admin.deleteUser(createdAuthUserId);
          }
        } catch (cleanupErr) {
          console.error("Erro ao limpar usuario auth apos falha de upsert:", cleanupErr);
        }
      }
      return new Response(`Falha ao persistir usuario: ${persistError.message}`, { status: 500 });
    }

    // No fluxo do proprio usuario (login sem perfil / onboarding), as permissoes
    // devem vir dos triggers do banco. Evita tentativas redundantes de insert em
    // modulo_acesso que podem cair em RLS dependendo do ambiente do Worker.
    const canBackfillPerms = !isSelf && (isAdmin || isMaster || isGestor);
    if (canBackfillPerms) {
      try {
        const permsClient = !isSelf ? dbWriteClient : supabaseServer;
        const hintedTypeName = await getUserTypeNameById(
          (payload.user_type_id ?? body.user_type_id ?? null) as string | null,
          permsClient
        );
        const master =
          hintedTypeName.includes("MASTER") ||
          (isSelf ? isMaster : await isUsuarioMaster(userId, permsClient));
        await garantirPermissoesPadrao(
          userId,
          master ? PERMISSAO_PADRAO_MASTER : PERMISSAO_PADRAO_VENDEDOR,
          permsClient
        );
        if (master) {
          await garantirPermissoesMaster(userId, permsClient);
        }
      } catch (permError: any) {
        // Em ambientes sem service role e/ou RLS estrito, o backfill pode falhar
        // para o proprio usuario sem impactar o fluxo de login/onboarding.
        if (isRlsViolation(permError)) {
          // ignora para nao poluir logs com erro esperado
        } else {
          console.warn("Falha ao garantir permissoes (nao bloqueante):", permError?.message || permError);
        }
      }
    }

    const usuarioCriadoAgora = Boolean(createdAuthUserId) || !usuarioExistente;
    const deveCriarConvite =
      fluxoCorporativoNovo && companyIdTarget && usuarioCriadoAgora;
    if (deveCriarConvite) {
      const invitedByRole: ConvitePayload["invited_by_role"] = isAdmin
        ? "ADMIN"
        : isMaster
        ? "MASTER"
        : "GESTOR";
      try {
        await createInviteWithClient(
          {
            invited_user_id: userId,
            invited_email: email,
            company_id: companyIdTarget,
            user_type_id: payload.user_type_id ?? body.user_type_id ?? null,
            invited_by: requestUser.id,
            invited_by_role: invitedByRole,
            status: "pending",
          },
          authClient
        );
      } catch (inviteError: any) {
        console.error("Falha ao registrar convite:", inviteError);
      }
    }

    if (usuarioCriadoAgora) {
      try {
        await enviarTemplateBoasVindas({
          userId,
          email,
          nomeCompleto: payload.nome_completo ?? body.nome_completo,
          companyId: payload.company_id ?? body.company_id ?? null,
          senhaTemporaria: tentativaCriacao && criadoPorOperador ? password : null,
        });
      } catch (welcomeErr) {
        console.error("Falha ao disparar template de boas-vindas:", welcomeErr);
      }
    }

    return Response.json(
      {
        id: userId,
        created: usuarioCriadoAgora,
      },
      { status: 200 }
    );
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
