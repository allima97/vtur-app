import { readEnv, hasServiceRoleKey } from "../../lib/supabaseServer";

type EnvStatus = {
  value?: string;
  present: boolean;
};

function mask(value?: string | null): string | undefined {
  if (!value) return undefined;
  if (value.length <= 8) return "*".repeat(value.length);
  return value.slice(0, 4) + "..." + value.slice(-4);
}

export async function GET() {
  // Lê usando a mesma função central usada pelo supabaseServer
  const supabaseUrl = readEnv("SUPABASE_URL") || readEnv("PUBLIC_SUPABASE_URL");
  const publicUrl = readEnv("PUBLIC_SUPABASE_URL");
  const publicAnonKey = readEnv("PUBLIC_SUPABASE_ANON_KEY");
  const serviceRoleKey = readEnv("SUPABASE_SERVICE_ROLE_KEY");

  const envStatus: Record<string, EnvStatus> = {
    SUPABASE_URL: {
      value: supabaseUrl,
      present: Boolean(supabaseUrl),
    },
    PUBLIC_SUPABASE_URL: {
      value: publicUrl,
      present: Boolean(publicUrl),
    },
    PUBLIC_SUPABASE_ANON_KEY: {
      value: mask(publicAnonKey),
      present: Boolean(publicAnonKey),
    },
    SUPABASE_SERVICE_ROLE_KEY: {
      value: mask(serviceRoleKey),
      present: Boolean(serviceRoleKey),
    },
  };

  const body = {
    ok:
      !!supabaseUrl &&
      (!!serviceRoleKey || !!publicAnonKey),
    hasServiceRoleKey,
    env: envStatus,
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
