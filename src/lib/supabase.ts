import { createBrowserClient } from "@supabase/ssr";

type BrowserSupabaseClient = ReturnType<typeof createBrowserClient>;

let cachedClient: BrowserSupabaseClient | null = null;

function getSupabaseConfig() {
  const supabaseUrl = String(import.meta.env.PUBLIC_SUPABASE_URL || "").trim();
  const supabaseAnonKey = String(import.meta.env.PUBLIC_SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    const missing = [
      !supabaseUrl && "PUBLIC_SUPABASE_URL",
      !supabaseAnonKey && "PUBLIC_SUPABASE_ANON_KEY",
    ]
      .filter(Boolean)
      .join(", ");

    throw new Error(
      `Faltam variáveis de ambiente: ${missing}. ` +
        "Configure-as nas variáveis do Cloudflare ou em um arquivo .env.local. " +
        "Consulte /test-env para validar."
    );
  }

  const supabaseProjectRef =
    supabaseUrl.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] ?? "";

  const supabaseCookieName = supabaseProjectRef
    ? `sb-${supabaseProjectRef}-auth-token`
    : "sb-auth-token";

  return {
    supabaseUrl,
    supabaseAnonKey,
    supabaseCookieName,
  };
}

function getSupabaseClient() {
  if (cachedClient) return cachedClient;

  const { supabaseUrl, supabaseAnonKey, supabaseCookieName } = getSupabaseConfig();
  cachedClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      name: supabaseCookieName,
      path: "/",
      sameSite: "lax",
    },
  });

  return cachedClient;
}

export const supabase = new Proxy({} as BrowserSupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseClient() as any;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
