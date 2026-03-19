import { createServerClient } from "@supabase/ssr";
import { readEnv } from "./supabaseServer";

type AstroCookieLike = {
  value: string;
};

type AstroCookiesLike = {
  get(name: string): AstroCookieLike | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
};

type AstroLike = {
  request: Request;
  cookies: AstroCookiesLike;
};

function isProductionLike() {
  return readEnv("ENVIRONMENT") === "production" || readEnv("NODE_ENV") === "production";
}

function parseCookieHeader(header: string) {
  if (!header) return [] as Array<{ name: string; value: string }>;

  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex === -1) {
        return { name: part, value: "" };
      }

      const name = decodeURIComponent(part.slice(0, separatorIndex).trim());
      const value = part.slice(separatorIndex + 1).trim();
      return { name, value };
    });
}

function getCookieDefaults() {
  return {
    httpOnly: true,
    secure: isProductionLike(),
    sameSite: "lax",
    path: "/",
  } as const;
}

export function createAstroServerClient(astro: AstroLike) {
  const supabaseUrl = readEnv("PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = readEnv("PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY são obrigatórias para createAstroServerClient.");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        const headerCookies = parseCookieHeader(astro.request.headers.get("cookie") || "");
        const names = new Set(headerCookies.map((cookie) => cookie.name));

        return Array.from(names).map((name) => ({
          name,
          value: astro.cookies.get(name)?.value ?? "",
        }));
      },
      setAll(cookiesToSet) {
        const defaults = getCookieDefaults();
        for (const { name, value, options } of cookiesToSet) {
          astro.cookies.set(name, value, {
            ...defaults,
            ...(options || {}),
          });
        }
      },
    },
  });
}