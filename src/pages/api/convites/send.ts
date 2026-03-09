import { supabaseServer, createServerClient, hasServiceRoleKey, readEnv } from "../../../lib/supabaseServer";
import { renderEmailHtml, renderEmailText } from "../../../lib/emailMarkdown";
import {
  buildFromEmails,
  resolveFromEmails,
  resolveResendApiKey,
  resolveSmtpConfig,
} from "../../../lib/emailSettings";
import { titleCaseWithExceptions } from "../../../lib/titleCase";

import { getSupabaseEnv } from "../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

const ALERTA_FROM_EMAIL = readEnv("ALERTA_FROM_EMAIL");
const SENDGRID_API_KEY = readEnv("SENDGRID_API_KEY");
const SENDGRID_FROM_EMAIL = readEnv("SENDGRID_FROM_EMAIL");

type BodyPayload = {
  email?: string | null;
  company_id?: string | null;
  user_type_id?: string | null;
  nome_completo?: string | null;
  active?: boolean | null;
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
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

function isTableMissing(error: any) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || message.includes("does not exist");
}

function isMissingColumn(error: any, column: string) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42703" && message.includes(column.toLowerCase());
}

async function getUserTypeNameById(userTypeId: string) {
  const { data, error } = await supabaseServer
    .from("user_types")
    .select("name")
    .eq("id", userTypeId)
    .maybeSingle();
  if (error) throw error;
  return String((data as any)?.name || "").toUpperCase();
}

async function isRestrictedUserType(userTypeId: string) {
  const nome = await getUserTypeNameById(userTypeId);
  return nome.includes("ADMIN") || nome.includes("MASTER");
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
    .select("id, company_id, user_type_id, user_types(name)")
    .eq("id", userId)
    .maybeSingle();
  if (selfErr) throw selfErr;

  const tipo = String((selfData as any)?.user_types?.name || "").toUpperCase();
  const companyId = ((selfData as any)?.company_id as string | null) || null;

  const isAdmin = tipo.includes("ADMIN");
  let isMaster = tipo.includes("MASTER");
  const isGestor = tipo.includes("GESTOR");

  if (!isMaster && !isAdmin) {
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

  if (!isMaster && !isAdmin) {
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
    isAdmin,
    isMaster: !isAdmin && isMaster,
    isGestor: !isAdmin && !isMaster && isGestor,
    companyId,
  };
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

function isAuthAlreadyRegisteredError(error: any) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists") ||
    message.includes("user already registered")
  );
}

export async function POST({ request }: { request: Request }) {
  try {
    const requestUser = await getUserFromRequest(request);
    if (!requestUser) return new Response("Sessao invalida.", { status: 401 });

    if (!hasServiceRoleKey) {
      return new Response(
        "SUPABASE_SERVICE_ROLE_KEY ausente no servidor. Necessario para gerar convites.",
        { status: 500 }
      );
    }

    const body = (await request.json()) as BodyPayload;
    const email = String(body.email || "").trim().toLowerCase();
    const companyId = String(body.company_id || "").trim();
    const userTypeId = String(body.user_type_id || "").trim();
    const nomeCompletoRaw = String(body.nome_completo || "").trim();
    const activeRaw = body.active;

    if (!email) return new Response("E-mail e obrigatorio.", { status: 400 });
    if (!companyId) return new Response("Empresa e obrigatoria.", { status: 400 });
    if (!userTypeId) return new Response("Cargo e obrigatorio.", { status: 400 });
    if (!isUuid(companyId)) return new Response("Empresa invalida.", { status: 400 });
    if (!isUuid(userTypeId)) return new Response("Cargo invalido.", { status: 400 });

    const requesterAccess = await getRequesterAccess(requestUser.id);
    if (!requesterAccess.isAdmin && !requesterAccess.isMaster && !requesterAccess.isGestor) {
      return new Response("Sem permissao para enviar convites.", { status: 403 });
    }

    if (!requesterAccess.isAdmin) {
      if (await isRestrictedUserType(userTypeId)) {
        return new Response("Tipo de usuario nao permitido.", { status: 403 });
      }
    }

    if (requesterAccess.isMaster) {
      const podeAcessar =
        (requesterAccess.companyId && requesterAccess.companyId === companyId) ||
        (await masterCanAccessCompany(requestUser.id, companyId));
      if (!podeAcessar) return new Response("Empresa fora do seu portfolio.", { status: 403 });
    }

    if (requesterAccess.isGestor) {
      if (!requesterAccess.companyId || requesterAccess.companyId !== companyId) {
        return new Response("Gestor so pode convidar usuarios da propria empresa.", {
          status: 403,
        });
      }
      const tipoNome = await getUserTypeNameById(userTypeId);
      if (!tipoNome.includes("VENDEDOR")) {
        return new Response("Gestor so pode convidar usuarios do tipo VENDEDOR.", {
          status: 403,
        });
      }
    }

    const invitedByRole = requesterAccess.isAdmin
      ? "ADMIN"
      : requesterAccess.isMaster
        ? "MASTER"
        : "GESTOR";

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    // Reaproveita convite pendente (renova expiração e reenvia)
    const { data: existingInvite, error: existingErr } = await supabaseServer
      .from("user_convites")
      .select("id, status")
      .eq("company_id", companyId)
      .ilike("invited_email", email)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (existingErr) {
      if (isTableMissing(existingErr)) {
        return new Response(
          "Tabela public.user_convites nao existe. Aplique a migration database/migrations/20260211_user_convites.sql.",
          { status: 500 }
        );
      }
      throw existingErr;
    }

    let inviteId = String((existingInvite as any)?.id || "");
    if (inviteId) {
      const { error: updateErr } = await supabaseServer
        .from("user_convites")
        .update({
          user_type_id: userTypeId,
          invited_by: requestUser.id,
          invited_by_role: invitedByRole,
          expires_at: expiresAt,
          cancelled_at: null,
        })
        .eq("id", inviteId);
      if (updateErr) {
        if (isMissingColumn(updateErr, "expires_at")) {
          return new Response(
            "Coluna public.user_convites.expires_at ausente. Aplique a migration database/migrations/20260311_user_convites_expiration.sql.",
            { status: 500 }
          );
        }
        throw updateErr;
      }
    } else {
      const { data: createdInvite, error: insertErr } = await supabaseServer
        .from("user_convites")
        .insert({
          invited_user_id: null,
          invited_email: email,
          company_id: companyId,
          user_type_id: userTypeId,
          invited_by: requestUser.id,
          invited_by_role: invitedByRole,
          status: "pending",
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (insertErr) {
        if (isMissingColumn(insertErr, "expires_at")) {
          return new Response(
            "Coluna public.user_convites.expires_at ausente. Aplique a migration database/migrations/20260311_user_convites_expiration.sql.",
            { status: 500 }
          );
        }
        throw insertErr;
      }
      inviteId = String((createdInvite as any)?.id || "");
    }

    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}/auth/convite?invite=${encodeURIComponent(inviteId)}`;

    let actionLink = "";
    let authUserId: string | null = null;

    try {
      // generateLink('invite') cria o usuario no Auth e gera o link sem disparar e-mail.
      // Se o usuario ja existir, alguns projetos retornam erro de "already registered";
      // nesse caso geramos um magic link.
      const { data: inviteData, error: inviteErr } = await supabaseServer.auth.admin.generateLink({
        type: "invite",
        email,
        options: { redirectTo },
      });

      if (inviteErr && isAuthAlreadyRegisteredError(inviteErr)) {
        const { data: magicData, error: magicErr } = await supabaseServer.auth.admin.generateLink({
          type: "magiclink",
          email,
          options: { redirectTo },
        });
        if (magicErr) throw magicErr;
        actionLink = String((magicData as any)?.properties?.action_link || "");
        authUserId = String((magicData as any)?.user?.id || "") || null;
      } else {
        if (inviteErr) throw inviteErr;
        actionLink = String((inviteData as any)?.properties?.action_link || "");
        authUserId = String((inviteData as any)?.user?.id || "") || null;
      }
    } catch (err: any) {
      console.error("Falha ao gerar link de convite:", err);
      const msg = String(err?.message || err || "");
      return new Response(`Falha ao gerar link de convite: ${msg || "erro desconhecido"}`, {
        status: 500,
      });
    }

    if (!actionLink) {
      return new Response("Falha ao gerar link de convite.", { status: 500 });
    }

    // Se o usuário já existe no public.users, amarra o FK do convite (opcional)
    if (authUserId) {
      const { data: profileRow } = await supabaseServer
        .from("users")
        .select("id, nome_completo")
        .eq("id", authUserId)
        .maybeSingle();
      if (profileRow?.id) {
        await supabaseServer
          .from("user_convites")
          .update({ invited_user_id: authUserId })
          .eq("id", inviteId);

        const updates: Record<string, any> = { email };
        const normalizedNome = titleCaseWithExceptions(nomeCompletoRaw);
        if (normalizedNome && !String((profileRow as any)?.nome_completo || "").trim()) {
          updates.nome_completo = normalizedNome;
        }
        if (typeof activeRaw === "boolean") {
          updates.active = activeRaw;
        }
        if (requesterAccess.isGestor) {
          updates.created_by_gestor = true;
        }
        if (Object.keys(updates).length > 0) {
          await supabaseServer.from("users").update(updates).eq("id", authUserId);
        }
      }
    }

    const { data: companyRow } = await supabaseServer
      .from("companies")
      .select("nome_fantasia")
      .eq("id", companyId)
      .maybeSingle();
    const companyName = String((companyRow as any)?.nome_fantasia || "sua empresa");

    const roleName = await getUserTypeNameById(userTypeId).catch(() => "");

    const raw = [
      `Voce recebeu um convite para acessar o vtur (${companyName}).`,
      roleName ? `Cargo: ${roleName}.` : "",
      "",
      "Clique no link abaixo para definir sua senha e concluir o acesso (expira em 1 hora):",
      actionLink,
      "",
      "Se voce nao reconhece este convite, ignore este e-mail.",
    ]
      .filter(Boolean)
      .join("\n");

    const subject = `Convite de acesso - ${companyName}`;
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
    const resendApiKey =
      String((settings as any)?.resend_api_key || "").trim() || (await resolveResendApiKey());
    const fromEmail = fromEmails.avisos || fromEmails.default || smtpConfig.from;

    const to = [email];
    const resendResp = await enviarEmailResend({
      to,
      subject,
      html,
      text,
      fromEmail,
      apiKey: resendApiKey,
    });
    if (!resendResp.ok) {
      const sendgridResp = await enviarEmailSendGrid({ to, subject, html, text, fromEmail });
      if (!sendgridResp.ok) {
        const smtpResp = await enviarEmailSMTP({ to, subject, html, text }, smtpConfig, fromEmail);
        if (!smtpResp.ok) {
          return new Response("Convite criado, mas falha ao enviar e-mail (Resend/SendGrid/SMTP).", {
            status: 500,
          });
        }
      }
    }

    // Opcional: gestor pre-atribui vendedor a equipe se o id existir
    if (requesterAccess.isGestor && authUserId) {
      try {
        let gestorEquipeId = requestUser.id;
        try {
          const { data: sharedRow, error: sharedErr } = await supabaseServer
            .from("gestor_equipe_compartilhada")
            .select("gestor_base_id")
            .eq("gestor_id", requestUser.id)
            .maybeSingle();
          if (!sharedErr && (sharedRow as any)?.gestor_base_id) {
            gestorEquipeId = String((sharedRow as any).gestor_base_id);
          }
        } catch (e) {
          // ignore (tabela pode nao existir em ambientes antigos)
        }

        await supabaseServer
          .from("gestor_vendedor")
          .delete()
          .eq("gestor_id", gestorEquipeId)
          .eq("vendedor_id", authUserId);
        await supabaseServer
          .from("gestor_vendedor")
          .insert({ gestor_id: gestorEquipeId, vendedor_id: authUserId, ativo: true });
      } catch (relErr) {
        console.warn("Falha ao pre-atribuir vendedor na equipe:", relErr);
      }
    }

    return new Response(
      JSON.stringify({
        id: inviteId,
        expires_at: expiresAt,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
