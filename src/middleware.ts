import { defineMiddleware } from "astro:middleware";
import { createServerClient } from "@supabase/ssr";
import { readEnv } from "./lib/supabaseServer";
import { descobrirModulo, listarModulosComHeranca, MAPA_MODULOS, MODULO_ALIASES } from "./config/modulos";
import {
  extractUserTypeName,
  isSystemAdminRole,
  normalizeUserType,
} from "./lib/adminAccess";
import { hasVerifiedTotpFactor, normalizeMfaRedirectPath } from "./lib/authMfa";

const supabaseUrl = readEnv("SUPABASE_URL") || readEnv("PUBLIC_SUPABASE_URL");
const supabaseAnonKey = readEnv("PUBLIC_SUPABASE_ANON_KEY") || readEnv("SUPABASE_ANON_KEY");
const MENU_CACHE_COOKIE = "vtur_menu_cache";
const LEGACY_MENU_CACHE_COOKIE = "sgtur_menu_cache";
const MENU_CACHE_TTL_MS = 5 * 60 * 1000;
const MENU_CACHE_MAX_BYTES = 3800;
const supabaseProjectRef =
  supabaseUrl?.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] ?? "";
const SUPABASE_AUTH_COOKIE_NAME = supabaseProjectRef
  ? `sb-${supabaseProjectRef}-auth-token`
  : "sb-auth-token";

const IS_DEV = Boolean(import.meta.env?.DEV);

const permLevel = (p?: string | null): number => {
  switch ((p || "").toLowerCase()) {
    case "admin":
      return 5;
    case "delete":
      return 4;
    case "edit":
      return 3;
    case "create":
      return 2;
    case "view":
      return 1;
    default:
      return 0;
  }
};

const normalizePermissao = (value?: string | null) => {
  const perm = (value || "").toLowerCase();
  if (perm === "admin") return "admin";
  if (perm === "delete") return "delete";
  if (perm === "edit") return "edit";
  if (perm === "create") return "create";
  if (perm === "view") return "view";
  return "none";
};

const setPerm = (perms: Record<string, string>, key: string, perm: string) => {
  if (!key) return;
  const normalizedKey = key.toLowerCase();
  const atual = perms[normalizedKey] ?? "none";
  perms[normalizedKey] = permLevel(perm) > permLevel(atual) ? perm : atual;
};

const normalizeModuloKey = (value?: string | null) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  return MODULO_ALIASES[raw] || raw.replace(/\s+/g, "_");
};

const buildPerms = (
  rows: Array<{ modulo: string | null; permissao: string | null; ativo: boolean | null }>
) => {
  const perms: Record<string, string> = {};
  rows.forEach((registro) => {
    const modulo = String(registro.modulo || "").toLowerCase();
    if (!modulo) return;
    const permissaoNormalizada = normalizePermissao(registro.permissao);
    const finalPerm = registro.ativo ? permissaoNormalizada : "none";
    setPerm(perms, modulo, finalPerm);
    const alias = MODULO_ALIASES[modulo];
    if (alias) setPerm(perms, alias, finalPerm);
  });
  return perms;
};

type MiddlewareCookies = {
  get: (name: string) => { value?: string } | undefined;
  delete: (name: string, options?: { path?: string; sameSite?: string; secure?: boolean }) => void;
};

function buildDeleteCookieOptions(secure: boolean) {
  return {
    path: "/",
    sameSite: "Lax" as const,
    secure,
  };
}

const SUPABASE_COOKIE_BASES = [SUPABASE_AUTH_COOKIE_NAME, "sb-auth-token"];

function buildExpiredCookieHeaders(secure: boolean) {
  const headers: string[] = [];
  const securePart = secure ? "; Secure" : "";
  SUPABASE_COOKIE_BASES.forEach((base) => {
    headers.push(`${base}=; Path=/; Max-Age=0; SameSite=Lax${securePart}`);
    for (let idx = 0; idx < 6; idx += 1) {
      headers.push(`${base}.${idx}=; Path=/; Max-Age=0; SameSite=Lax${securePart}`);
    }
  });
  return headers;
}

function isInvalidSupabaseCookieError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = String((error as any).message ?? "").toLowerCase();
  const patterns = [
    "base64-url",
    "base64url",
    "utf-8",
    "jwt",
    "token",
    "cookie",
    "session",
    "invalid",
    "malformed",
    "parse",
    "signature",
    "expired",
  ];
  return patterns.some((pattern) => message.includes(pattern));
}

function buildLoginRedirectUrl(url: URL) {
  const nextPath = `${url.pathname}${url.search || ""}`;
  return `/auth/login?next=${encodeURIComponent(nextPath)}`;
}

function buildMfaSetupRedirectUrl(url: URL) {
  const nextPath = `${url.pathname}${url.search || ""}`;
  return `/perfil?setup_2fa=1&next=${encodeURIComponent(nextPath)}`;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { url } = context;
  const pathname = url.pathname;

  const protoHeader = String(context.request.headers.get("x-forwarded-proto") || "").toLowerCase();
  const isHttps = url.protocol === "https:" || protoHeader === "https";

  const makeMutable = (response: Response) =>
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });

  const nextMutable = async () => makeMutable(await next());

  try {

  // ROTAS PUBLICAS
  const rotasPublicas = [
  "/auth/login",
  "/auth/register",
  "/auth/recover",
  "/auth/reset",
  "/auth/convite",
  "/auth/update-password",
  "/manutencao",
  "/test-env",
  "/favicon",
  "/favicon.ico",
  "/icons",
  "/brand",
  "/manifest.webmanifest",
  "/_astro",
  "/assets",
  "/public",
  "/pdfs",
  "/api/v1/cards",

  // DEV (Vite/Astro): não deve passar por auth/middleware
  "/@vite",
  "/@id",
  "/@fs",
  "/__vite_ping",
  "/__astro",
  "/_image",
  ];

  const isPublic = rotasPublicas.some((r) => pathname.startsWith(r));

  // Rotas públicas e assets não precisam de sessão (evita set-cookie após response).
  if (isPublic) return await nextMutable();

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "SUPABASE_URL/PUBLIC_SUPABASE_URL ou SUPABASE_ANON_KEY/PUBLIC_SUPABASE_ANON_KEY ausentes. Configure as variáveis de ambiente (Pages/Workers → Settings → Environment Variables)."
    );
    return makeMutable(new Response(
      "Faltam SUPABASE_URL/PUBLIC_SUPABASE_URL ou SUPABASE_ANON_KEY/PUBLIC_SUPABASE_ANON_KEY. Configure no Cloudflare e no .env local.",
      { status: 500 }
    ));
  }

  // Criar supabase SSR
  const { cookies } = context;
  let supabase;
  const builderOptions = {
    cookies: {
      get: (name: string) => cookies.get(name)?.value ?? "",
      set: (name: string, value: string, options: any) =>
        cookies.set(name, value, {
          ...options,
          httpOnly: true,
          secure: isHttps,
          sameSite: "Lax",
          path: "/",
        }),
      remove: (name: string, options: any) =>
        cookies.delete(name, {
          ...options,
          path: "/",
        }),
    },
  } as const;

  try {
    supabase = createServerClient(supabaseUrl, supabaseAnonKey, builderOptions);
  } catch (error) {
    if (isInvalidSupabaseCookieError(error)) {
      const headers = buildExpiredCookieHeaders(isHttps);
      return makeMutable(new Response(null, {
        status: 302,
        headers: [
          ["location", buildLoginRedirectUrl(url)],
          ...headers.map((value) => ["set-cookie", value]),
        ],
      }));
    }
    throw error;
  }

  // Verifica usuario logado
  let user = null as any;
  try {
    const { data } = await supabase.auth.getUser();
    user = data?.user ?? null;
  } catch (error) {
    const cookieHeader = context.request.headers.get("cookie") || "";
    console.error("[middleware] falha ao ler sessao", {
      error,
      cookieLength: cookieHeader.length,
      cookiePreview: cookieHeader.slice(0, 200),
    });
    const headers = buildExpiredCookieHeaders(isHttps);
    return makeMutable(new Response(null, {
      status: 302,
      headers: [
        ["location", buildLoginRedirectUrl(url)],
        ...headers.map((value) => ["set-cookie", value]),
      ],
    }));
  }

  if (!user) {
    return makeMutable(Response.redirect(new URL(buildLoginRedirectUrl(url), url), 302));
  }
  context.locals.userId = user.id;
  context.locals.userEmail = user.email ?? "";

  const cookieRaw =
    context.cookies.get(MENU_CACHE_COOKIE)?.value ??
    context.cookies.get(LEGACY_MENU_CACHE_COOKIE)?.value ??
    "";
  let shouldRefreshMenuCache = true;
  let cachedUserType = "";
  let cachedIsSystemAdmin = false;
  if (cookieRaw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cookieRaw));
      if (parsed?.userId === user.id) {
        const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0;
        cachedUserType = normalizeUserType(parsed?.userType);
        cachedIsSystemAdmin =
          typeof parsed?.isSystemAdmin === "boolean"
            ? parsed.isSystemAdmin
            : isSystemAdminRole(cachedUserType);
        const isFresh = updatedAt && Date.now() - updatedAt < MENU_CACHE_TTL_MS;
        const hasUserType = Boolean(cachedUserType);
        if (isFresh && hasUserType) {
          shouldRefreshMenuCache = false;
        }
      }
    } catch {
      shouldRefreshMenuCache = true;
    }
  }

  let userType = cachedUserType;
  let isSystemAdmin = cachedIsSystemAdmin;

  // Bloqueio de onboarding: exige perfil completo antes de acessar outros módulos
  const rotasOnboardingPermitidas = ["/perfil", "/auth", "/api/companies", "/api/welcome-email"];
  const rotasSenhaObrigatoriaPermitidas = [
    "/perfil",
    "/auth",
    "/api/companies",
    "/api/welcome-email",
    "/api/users",
  ];
  const isMfaRoute = pathname.startsWith("/auth/mfa");

  if (shouldRefreshMenuCache) {
    const [accRowsRes, userTypeRes] = await Promise.all([
      supabase
        .from("modulo_acesso")
        .select("modulo, permissao, ativo")
        .eq("usuario_id", user.id),
      supabase
        .from("users")
        .select("id, user_types(name)")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    const acessos = buildPerms(
      (accRowsRes.data || []) as Array<{
        modulo: string | null;
        permissao: string | null;
        ativo: boolean | null;
      }>
    );

    const rawType = extractUserTypeName(userTypeRes.data);
    userType = normalizeUserType(rawType);
    isSystemAdmin = isSystemAdminRole(userType);

    // Emergencial: desativa escrita do cache de menu para evitar headers de Cookie muito grandes.
    const payload = {
      userId: user.id,
      acessos,
      updatedAt: Date.now(),
      userEmail: user.email ?? "",
      userType,
      isSystemAdmin,
    };
    const _debugMenuCacheDisabled = payload; // mantido apenas para debug/local.
  }

  const isSenhaObrigatoriaAllowed = rotasSenhaObrigatoriaPermitidas.some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (!isSenhaObrigatoriaAllowed) {
    let mustChangePassword = false;
    const { data: senhaData, error: senhaErr } = await supabase
      .from("users")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle();

    if (!senhaErr) {
      mustChangePassword = Boolean((senhaData as any)?.must_change_password);
    } else {
      const missingColumn =
        String((senhaErr as any)?.code || "") === "42703" ||
        String((senhaErr as any)?.message || "").toLowerCase().includes("must_change_password");
      if (!missingColumn) {
        console.error("[middleware] falha ao verificar troca obrigatoria de senha", senhaErr);
      }
      // Em caso de erro (ex.: RLS), não bloqueia o acesso por engano.
      mustChangePassword = false;
    }

    if (mustChangePassword) {
      return makeMutable(Response.redirect(new URL("/perfil?force_password=1", url), 302));
    }
  }

  if (isSystemAdmin) {
    return await nextMutable();
  }

  // Bloquear acesso até completar o onboarding (perfil obrigatório)
  const isOnboardingAllowed = rotasOnboardingPermitidas.some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (!isOnboardingAllowed) {
    const { data: perfil, error: perfilErr } = await supabase
      .from("users")
      .select("nome_completo, telefone, cidade, estado, uso_individual")
      .eq("id", user.id)
      .maybeSingle();

    // Se deu erro ao consultar (RLS/perm), não força onboarding (evita loop pro login).
    if (perfilErr) {
      console.error("[middleware] falha ao verificar onboarding", perfilErr);
      return await nextMutable();
    }
    const precisaOnboarding =
      !perfil?.nome_completo ||
      !perfil?.telefone ||
      !perfil?.cidade ||
      !perfil?.estado ||
      perfil?.uso_individual === null ||
      perfil?.uso_individual === undefined;
    if (precisaOnboarding) {
      return makeMutable(Response.redirect(new URL("/perfil/onboarding", url), 302));
    }
  }

  try {
    const { data: companyRow, error: companyErr } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (companyErr) {
      throw companyErr;
    }

    const companyId = String((companyRow as any)?.company_id || "").trim() || null;
    let mfaObrigatorio = false;
    if (companyId) {
      const { data: paramData, error: paramErr } = await supabase
        .from("parametros_comissao")
        .select("mfa_obrigatorio")
        .eq("company_id", companyId)
        .maybeSingle();
      if (paramErr) {
        throw paramErr;
      }
      mfaObrigatorio = Boolean((paramData as any)?.mfa_obrigatorio);
    }

    const [{ data: aalData, error: aalError }, { data: factorsData, error: factorsError }] =
      await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
    if (!aalError && !factorsError) {
      const hasFactor = hasVerifiedTotpFactor(factorsData || null);
      if (mfaObrigatorio && !hasFactor && !pathname.startsWith("/perfil")) {
        return makeMutable(
          Response.redirect(new URL(buildMfaSetupRedirectUrl(url), url), 302)
        );
      }

      const precisaMfa =
        hasFactor &&
        aalData?.nextLevel === "aal2" &&
        aalData?.currentLevel !== "aal2";
      if (precisaMfa && !isMfaRoute) {
        const nextPath = normalizeMfaRedirectPath(`${pathname}${url.search || ""}`, "/dashboard");
        return makeMutable(
          Response.redirect(new URL(`/auth/mfa?next=${encodeURIComponent(nextPath)}`, url), 302)
        );
      }
    }
  } catch (mfaError) {
    console.error("[middleware] falha ao verificar MFA", mfaError);
  }

  // ============================
  // 1) MAPEAMENTO DE ROTAS → MÓDULOS
  // ============================
  // Rotas que exigem login, mas nao exigem modulo_acesso.
  if (
    pathname.startsWith("/perfil") ||
    pathname.startsWith("/negado") ||
    pathname.startsWith("/documentacao")
  ) {
    return await nextMutable();
  }

  const modulo = descobrirModulo(pathname);
  if (!modulo) return await nextMutable(); // rota não associada a módulo

  // ============================
  // 2) PEGAR PERMISSÃO DO USUÁRIO
  // ============================
  const modulosConsulta = Array.from(
    new Set(
      listarModulosComHeranca(modulo).flatMap((label) => {
        const key = MAPA_MODULOS[label];
        return key ? [label, key] : [label];
      }),
    ),
  );

  const modulosPermitidos = new Set<string>();
  modulosConsulta.forEach((entry) => {
    const normalized = normalizeModuloKey(entry);
    if (normalized) modulosPermitidos.add(normalized);
  });

  const { data: accRows } = await supabase
    .from("modulo_acesso")
    .select("permissao, ativo, modulo")
    .eq("usuario_id", user.id);

  const acessosValidos = (accRows || []).filter((row) => {
    if (!row?.ativo) return false;
    const moduloKey = normalizeModuloKey(row?.modulo);
    return moduloKey ? modulosPermitidos.has(moduloKey) : false;
  });
  if (acessosValidos.length === 0) {
    return makeMutable(Response.redirect(new URL("/negado", url), 302));
  }

  const nivel = ["none", "view", "create", "edit", "delete", "admin"];
  const melhorPermissao = acessosValidos.reduce((acc, row) => {
    const perm = String(row.permissao || "none");
    const idx = nivel.indexOf(perm as any);
    if (idx > acc.idx) return { perm, idx };
    return acc;
  }, { perm: "none", idx: 0 });

  const permissao = melhorPermissao.perm as
    | "none"
    | "view"
    | "create"
    | "edit"
    | "delete"
    | "admin";

  // ============================
  // 3) VALIDAR NÍVEL DE ACESSO
  // ============================
  const idx = nivel.indexOf(permissao);

  if (idx < 1) {
    // none → bloqueado
    return makeMutable(Response.redirect(new URL("/negado", url), 302));
  }

  // ADMIN → sempre permitido
  if (permissao === "admin") return await nextMutable();

  // Para qualquer outra permissão (view / create / edit / delete)
  // acesso à rota é permitido, restrições de função ficam nos islands.
  return await nextMutable();

  } catch (error: any) {
    console.error("[middleware] erro inesperado", {
      message: error?.message ?? String(error),
      stack: error?.stack,
      url: context.request.url,
      method: context.request.method,
      ray: context.request.headers.get("cf-ray"),
      ua: context.request.headers.get("user-agent"),
    });
    // Evita "Worker threw exception" (1101) e dá uma resposta controlada.
    const msg = IS_DEV
      ? `Erro temporário (middleware). ${error?.message ?? String(error)}`
      : "Erro temporário. Tente novamente.";
    return makeMutable(new Response(msg, { status: 503 }));
  }

});
