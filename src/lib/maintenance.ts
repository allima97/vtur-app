import { supabaseServer } from "./supabaseServer";

type MaintenanceStatus = {
  enabled: boolean;
  message: string | null;
  updatedAt: string | null;
  source: "db" | "default";
};

const CACHE_TTL_MS = 15_000;
let cached: { expiresAt: number; value: MaintenanceStatus } | null = null;

function isMissingTable(error: any) {
  const msg = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();
  return code === "42p01" || msg.includes("does not exist") || msg.includes("relation");
}

export async function getMaintenanceStatus(): Promise<MaintenanceStatus> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const { data, error } = await supabaseServer
      .from("admin_system_settings")
      .select("maintenance_enabled, maintenance_message, updated_at")
      .eq("singleton", true)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error)) {
        const fallback: MaintenanceStatus = {
          enabled: false,
          message: null,
          updatedAt: null,
          source: "default",
        };
        cached = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
        return fallback;
      }
      throw error;
    }

    const status: MaintenanceStatus = {
      enabled: Boolean(data?.maintenance_enabled),
      message: data?.maintenance_message ?? null,
      updatedAt: data?.updated_at ?? null,
      source: data ? "db" : "default",
    };

    cached = { value: status, expiresAt: Date.now() + CACHE_TTL_MS };
    return status;
  } catch (err) {
    console.error("[maintenance] Falha ao carregar status", err);
    const fallback: MaintenanceStatus = {
      enabled: false,
      message: null,
      updatedAt: null,
      source: "default",
    };
    cached = { value: fallback, expiresAt: Date.now() + CACHE_TTL_MS };
    return fallback;
  }
}

export function clearMaintenanceCache() {
  cached = null;
}
