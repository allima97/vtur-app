import { createBrowserClient } from "@supabase/ssr";

// Fallbacks públicos (publishable) – já estão em wrangler.toml
const FALLBACK_SUPABASE_URL = "https://ggqmvruerbaqxthhnxrm.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY =
  "sb_publishable_yO4zM8WFfmRTZKtBG1PaHw_9pLyVXMh";

// Tenta usar as envs do build; se vierem vazias, cai para os fallbacks
const supabaseUrl =
  (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined) ||
  FALLBACK_SUPABASE_URL;

const supabaseAnonKey =
  (import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined) ||
  FALLBACK_SUPABASE_ANON_KEY;

const supabaseProjectRef =
  supabaseUrl?.match(/https:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1] ?? "";

const supabaseCookieName = supabaseProjectRef
  ? `sb-${supabaseProjectRef}-auth-token`
  : "sb-auth-token";

if (!supabaseUrl || !supabaseAnonKey) {
  const missing = [
    !supabaseUrl && "PUBLIC_SUPABASE_URL",
    !supabaseAnonKey && "PUBLIC_SUPABASE_ANON_KEY",
  ]
    .filter(Boolean)
    .join(", ");

  const msg =
    `Faltam variáveis de ambiente: ${missing}. ` +
    "Configure-as nas variáveis do Cloudflare ou em um arquivo .env.local. " +
    "Consulte /test-env para validar.";

  if (typeof console !== "undefined") {
    console.error("[supabase] " + msg);
  }
}

// Usa sempre os valores já resolvidos (com fallback)
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  cookieOptions: {
    name: supabaseCookieName,
    path: "/",
    sameSite: "lax",
  },
});
