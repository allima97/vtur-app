import type {
  ExecutionContext,
  ExportedHandlerFetchHandler,
  ExportedHandlerScheduledHandler,
} from "@cloudflare/workers-types";
import type { SSRManifest } from "astro";
import { App } from "astro/app";
import { handle } from "@astrojs/cloudflare/handler";
import { createApiApp } from "./api/apiApp";
import { getMaintenanceStatus } from "./lib/maintenance";
import { reconcilePendentes } from "./pages/api/v1/conciliacao/_reconcile";

type Env = {
  [key: string]: unknown;
  ASSETS?: {
    fetch: (req: Request | string) => Promise<Response>;
  };
};

function ensureSSRDomGlobals() {
  const g = globalThis as any;

  if (typeof g.HTMLElement === "undefined") {
    g.HTMLElement = class HTMLElement {};
  }
  if (typeof g.Element === "undefined") {
    g.Element = g.HTMLElement;
  }
  if (typeof g.Node === "undefined") {
    g.Node = class Node {};
  }
}

function logUncaughtError(params: {
  error: unknown;
  request: Request;
}) {
  const err = params.error as any;
  console.error("EDGE_UNCAUGHT", {
    message: err?.message ?? String(params.error),
    stack: err?.stack,
    url: params.request.url,
    method: params.request.method,
    ray: params.request.headers.get("cf-ray"),
    ua: params.request.headers.get("user-agent"),
  });
}

export function createExports(manifest: SSRManifest) {
  const app = new App(manifest);
  const astroHandle = (request: Request, env: Env, context: ExecutionContext) => {
    // Provide a mock ASSETS binding if not available
    if (!env.ASSETS) {
      env.ASSETS = {
        fetch: async (req: Request | string) => {
          // Return a 404 for static assets - will be handled by fallback
          const path = typeof req === "string" ? req : req.url;
          console.debug(`[ASSETS] Fallback for: ${path}`);
          return new Response("Not Found (fallback to Pages)", { status: 404 });
        },
      };
    }
    return handle(manifest, app, request, env, context);
  };
  const apiApp = createApiApp({ astroHandle });

  const fetch: ExportedHandlerFetchHandler = async (
    request: Parameters<ExportedHandlerFetchHandler>[0],
    env: Env,
    context: ExecutionContext
  ) => {
    ensureSSRDomGlobals();
    // Expose env to SSR/API modules that don't receive env directly
    (globalThis as any).env = env;
    try {
      const url = new URL(request.url);
      const pathname = url.pathname;
      const maintenanceRaw =
        typeof env.MAINTENANCE_MODE === "string" ? env.MAINTENANCE_MODE : String(env.MAINTENANCE_MODE ?? "");
      const maintenanceOn = ["1", "true", "yes", "on"].includes(maintenanceRaw.toLowerCase());
      const maintenanceBypassToken =
        typeof env.MAINTENANCE_BYPASS_TOKEN === "string"
          ? env.MAINTENANCE_BYPASS_TOKEN
          : String(env.MAINTENANCE_BYPASS_TOKEN ?? "");
      const bypassCookieName = "vtur_maintenance_bypass";
      const legacyBypassCookieName = "sgtur_maintenance_bypass";
      const cookieHeader = request.headers.get("cookie") || "";
      const hasBypassCookie = cookieHeader
        .split(";")
        .map((part) => part.trim())
        .some(
          (part) =>
            part.startsWith(`${bypassCookieName}=`) ||
            part.startsWith(`${legacyBypassCookieName}=`)
        );
      const bypassParam = url.searchParams.get("maintenance");
      const isBypassLogout = bypassParam === "1";
      const bypassTokenParam = url.searchParams.get("token") || "";
      const bypassGranted =
        bypassParam === "0" &&
        Boolean(maintenanceBypassToken) &&
        bypassTokenParam === maintenanceBypassToken;
      const bypassActive = hasBypassCookie || bypassGranted;
      const shouldSetBypassCookie = bypassGranted && !hasBypassCookie;
      const shouldClearBypassCookie = isBypassLogout && hasBypassCookie;
      const maintenanceStatus = await getMaintenanceStatus();
      const maintenanceDbOn = maintenanceStatus.enabled;
      const maintenanceActive = maintenanceOn || maintenanceDbOn;
      const bypassAllowed = maintenanceOn && bypassActive;
      const maintenanceAllowList = [
        "/manutencao",
        "/api/v1/admin/maintenance",
        "/_astro",
        "/assets",
        "/favicon",
        "/icons",
        "/brand",
        "/manifest.webmanifest",
        "/public",
        "/pdfs",
        "/sw.js",
        "/robots.txt",
      ];
      const isMaintenanceAllowed = maintenanceAllowList.some((route) =>
        route === "/manutencao" ? pathname === route : pathname.startsWith(route)
      );

      const finalizeResponse = (response: Response) => {
        if (!shouldSetBypassCookie && !shouldClearBypassCookie) return response;
        const headers = new Headers(response.headers);
        if (shouldSetBypassCookie) {
          headers.append(
            "Set-Cookie",
            `${bypassCookieName}=1; Path=/; Max-Age=7200; SameSite=Lax; Secure`
          );
        }
        if (shouldClearBypassCookie) {
          headers.append(
            "Set-Cookie",
            `${bypassCookieName}=; Path=/; Max-Age=0; SameSite=Lax; Secure`
          );
          headers.append(
            "Set-Cookie",
            `${legacyBypassCookieName}=; Path=/; Max-Age=0; SameSite=Lax; Secure`
          );
        }
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      };

      if (isBypassLogout && (request.method === "GET" || request.method === "HEAD")) {
        const cleanUrl = new URL(request.url);
        cleanUrl.searchParams.delete("maintenance");
        cleanUrl.searchParams.delete("token");
        return finalizeResponse(Response.redirect(cleanUrl, 302));
      }

      if (maintenanceActive && !isMaintenanceAllowed && !bypassAllowed) {
        if (request.method === "GET" || request.method === "HEAD") {
          return Response.redirect(new URL("/manutencao", url), 302);
        }
        return new Response("Manutencao em andamento.", {
          status: 503,
          headers: { "Retry-After": "3600" },
        });
      }

      // Handle API routes with proper error handling
      if (pathname.startsWith("/api/")) {
        try {
          return finalizeResponse(await apiApp.fetch(request, env as any, context));
        } catch (error) {
          logUncaughtError({ error, request });
          return new Response(`API Error: ${error instanceof Error ? error.message : String(error)}`, { status: 500 });
        }
      }

      // Let Astro handle pages and routing
      try {
        return finalizeResponse(await astroHandle(request, env, context));
      } catch (error) {
        // If Astro handler fails for static assets, try fallback to Pages
        if (pathname.startsWith("/_astro/") || pathname.endsWith(".css") || pathname.endsWith(".js")) {
          console.warn(`[FALLBACK] Trying Pages for: ${pathname}`);
          try {
            // Try to fetch from Pages - simulating a Pages fallback
            // In production, this would be the Pages project serving these assets
            return new Response("Static asset not found in Worker, should be served by Pages CDN", {
              status: 404,
              headers: { "X-Fallback": "pages" }
            });
          } catch {
            // If fallback also fails, return error
            logUncaughtError({ error, request });
            return new Response(`Asset not found: ${pathname}`, { status: 404 });
          }
        }

        // For other errors, return generic error
        logUncaughtError({ error, request });
        return new Response(`Erro temporário: ${error instanceof Error ? error.message : String(error)}`, { status: 503 });
      }
    } catch (error) {
      logUncaughtError({ error, request });
      return new Response(`Erro temporário: ${error instanceof Error ? error.message : String(error)}`, { status: 503 });
    }
  };

  const scheduled: ExportedHandlerScheduledHandler = async (_event, env: Env, context) => {
    // Expose env to modules that rely on it.
    (globalThis as any).env = env;
    context.waitUntil(
      (async () => {
        try {
          const result = await reconcilePendentes({ limit: 500, actor: "cron" });
          console.log("CRON_CONCILIACAO", result);
        } catch (error) {
          console.error("CRON_CONCILIACAO_ERROR", {
            message: (error as any)?.message ?? String(error),
            stack: (error as any)?.stack,
          });
        }
      })()
    );
  };

  return { default: { fetch, scheduled } };
}
