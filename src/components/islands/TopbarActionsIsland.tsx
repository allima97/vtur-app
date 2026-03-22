import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { logoutUsuario } from "../../lib/logout";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { getUserInitials } from "../../lib/profileAvatar";
import AppButton from "../ui/primer/AppButton";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type UserTopbarProfile = {
  nome_completo: string | null;
  email: string | null;
  avatar_url: string | null;
};

type SessionBootstrapPayload = {
  recadosUnread?: number;
  agendaToday?: number;
};

const BADGE_LIMIT = 99;

function formatBadge(count: number) {
  return count > BADGE_LIMIT ? `${BADGE_LIMIT}+` : String(count);
}

export default function TopbarActionsIsland() {
  const { userId, userEmail, can, ready, refresh } = usePermissoesStore();
  const [pathname, setPathname] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [refreshingPerms, setRefreshingPerms] = useState(false);
  const [profile, setProfile] = useState<UserTopbarProfile | null>(null);
  const [agendaCount, setAgendaCount] = useState(0);
  const [recadosCount, setRecadosCount] = useState(0);

  const canSeeAgenda = can("Agenda");
  const canSeeRecados = can("Mural de Recados");
  const canOpenHelp = pathname !== "/documentacao";

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      return;
    }

    try {
      let data: any = null;
      let error: any = null;

      const primary = await supabase
        .from("users")
        .select("nome_completo, email, avatar_url")
        .eq("id", userId)
        .maybeSingle();

      data = primary.data;
      error = primary.error;

      if (error && error.code === "PGRST204") {
        const fallback = await supabase
          .from("users")
          .select("nome_completo, email")
          .eq("id", userId)
          .maybeSingle();
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;

      setProfile({
        nome_completo: data?.nome_completo || null,
        email: data?.email || userEmail || null,
        avatar_url: data?.avatar_url || null,
      });
    } catch (error) {
      console.error("Erro ao carregar perfil do topo:", error);
      setProfile({
        nome_completo: null,
        email: userEmail || null,
        avatar_url: null,
      });
    }
  }, [userEmail, userId]);

  const loadAlerts = useCallback(async () => {
    if (!userId) {
      setAgendaCount(0);
      setRecadosCount(0);
      return;
    }

    try {
      const response = await fetch("/api/v1/session/bootstrap", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(await response.text());

      const payload = (await response.json()) as SessionBootstrapPayload;
      const nextAgenda = Number(payload?.agendaToday ?? 0);
      const nextRecados = Number(payload?.recadosUnread ?? 0);
      setAgendaCount(Number.isFinite(nextAgenda) ? nextAgenda : 0);
      setRecadosCount(Number.isFinite(nextRecados) ? nextRecados : 0);
    } catch (error) {
      console.error("Erro ao carregar alertas do topo:", error);
      setAgendaCount(0);
      setRecadosCount(0);
    }
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPathname(window.location.pathname || "");
  }, []);

  useEffect(() => {
    if (!ready || !userId) return;
    void loadProfile();
    void loadAlerts();
  }, [loadAlerts, loadProfile, ready, userId]);

  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadAlerts();
      }
    };
    const handleFocus = () => {
      void loadAlerts();
    };
    const handleProfileUpdated = () => {
      void loadProfile();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("sgtur:user-profile-updated", handleProfileUpdated as EventListener);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(() => {
      void loadAlerts();
    }, 30000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("sgtur:user-profile-updated", handleProfileUpdated as EventListener);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [loadAlerts, loadProfile, userId]);

  const avatarInitials = useMemo(
    () => getUserInitials(profile?.nome_completo, profile?.email || userEmail || null),
    [profile?.email, profile?.nome_completo, userEmail]
  );

  const profileTitle = useMemo(() => {
    const primary = String(profile?.nome_completo || "").trim();
    const secondary = String(profile?.email || userEmail || "").trim();
    return [primary || "Perfil", secondary].filter(Boolean).join(" - ");
  }, [profile?.email, profile?.nome_completo, userEmail]);

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await logoutUsuario();
    } finally {
      setLoggingOut(false);
    }
  }

  async function handleRefreshPermissions() {
    try {
      setRefreshingPerms(true);
      await refresh();
    } catch (error) {
      console.error("Erro ao atualizar permissoes pelo topo:", error);
    } finally {
      setRefreshingPerms(false);
    }
  }

  if (!ready || !userId) return null;

  return (
    <AppPrimerProvider>
      <div className="app-topbar-actions" role="toolbar" aria-label="Acoes do usuario">
        {canSeeAgenda && (
          <div className="app-topbar-action-item">
            <AppButton
              as="a"
              href="/operacao/agenda"
              variant="ghost"
              className="app-topbar-icon-button"
              icon="pi pi-calendar"
              aria-label="Agenda"
              title="Agenda"
            />
            {agendaCount > 0 && <span className="app-topbar-badge">{formatBadge(agendaCount)}</span>}
          </div>
        )}

        {canSeeRecados && (
          <div className="app-topbar-action-item">
            <AppButton
              as="a"
              href="/operacao/recados"
              variant="ghost"
              className="app-topbar-icon-button"
              icon="pi pi-comments"
              aria-label="Mural de recados"
              title="Mural de recados"
            />
            {recadosCount > 0 && <span className="app-topbar-badge">{formatBadge(recadosCount)}</span>}
          </div>
        )}

        <AppButton
          type="button"
          variant="ghost"
          className="app-topbar-icon-button"
          icon={`pi pi-sync${refreshingPerms ? " pi-spin" : ""}`}
          aria-label="Atualizar permissoes"
          title={refreshingPerms ? "Atualizando permissoes..." : "Atualizar permissoes"}
          onClick={handleRefreshPermissions}
          disabled={refreshingPerms}
        />

        {canOpenHelp && (
          <AppButton
            type="button"
            variant="ghost"
            className="app-topbar-icon-button"
            icon="pi pi-question-circle"
            aria-label="Abrir ajuda"
            title="Abrir ajuda"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("sgtur:open-help"));
              }
            }}
          />
        )}

        <AppButton
          as="a"
          href="/perfil/personalizar"
          variant="ghost"
          className="app-topbar-icon-button"
          icon="pi pi-sliders-h"
          aria-label="Personalizar"
          title="Personalizar"
        />

        <AppButton
          type="button"
          variant="ghost"
          className="app-topbar-icon-button app-topbar-icon-button-danger"
          icon="pi pi-sign-out"
          aria-label="Sair"
          title={loggingOut ? "Saindo..." : "Sair"}
          onClick={handleLogout}
          disabled={loggingOut}
        />

        <a
          href="/perfil"
          className="app-topbar-avatar-button"
          aria-label="Perfil"
          title={profileTitle}
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="app-topbar-avatar-image" />
          ) : (
            <span className="app-topbar-avatar-fallback" aria-hidden="true">
              {avatarInitials}
            </span>
          )}
        </a>
      </div>
    </AppPrimerProvider>
  );
}
