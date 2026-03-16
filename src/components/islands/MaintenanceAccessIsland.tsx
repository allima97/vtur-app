import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";

type MaintenanceStatus = {
  maintenance_enabled: boolean;
  maintenance_message: string | null;
  updated_at: string | null;
};

type ViewState = "loading" | "login" | "forbidden" | "admin";

export default function MaintenanceAccessIsland() {
  const [view, setView] = useState<ViewState>("loading");
  const [status, setStatus] = useState<MaintenanceStatus>({
    maintenance_enabled: false,
    maintenance_message: null,
    updated_at: null,
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setView("loading");
      setMessage(null);
      const resp = await fetch("/api/v1/admin/maintenance");
      if (resp.status === 401) {
        setView("login");
        return;
      }
      if (resp.status === 403) {
        setView("forbidden");
        return;
      }
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const payload = (await resp.json()) as MaintenanceStatus;
      setStatus({
        maintenance_enabled: Boolean(payload?.maintenance_enabled),
        maintenance_message: payload?.maintenance_message ?? null,
        updated_at: payload?.updated_at ?? null,
      });
      setView("admin");
    } catch (err) {
      console.error(err);
      setMessage("Erro ao carregar status de manutencao.");
      setView("login");
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const emailTrim = email.trim().toLowerCase();
    if (!emailTrim || !password) {
      setMessage("Informe e-mail e senha.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailTrim,
      password,
    });

    if (error) {
      setMessage("Falha no login. Verifique seus dados.");
      return;
    }

    await loadStatus();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
    setView("login");
  }

  async function handleSave() {
    try {
      setSaving(true);
      setMessage(null);
      const resp = await fetch("/api/v1/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maintenance_enabled: status.maintenance_enabled,
          maintenance_message: status.maintenance_message,
        }),
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      setMessage("Status de manutencao atualizado.");
    } catch (err) {
      console.error(err);
      setMessage("Erro ao salvar manutencao.");
    } finally {
      setSaving(false);
    }
  }

  if (view === "loading") {
    return (
      <AppCard tone="config" className="maintenance-admin">
        Carregando acesso...
      </AppCard>
    );
  }

  if (view === "forbidden") {
    return (
      <AppCard
        tone="config"
        className="maintenance-admin"
        title="Area restrita"
        subtitle="Somente administradores podem alterar o modo de manutencao."
      >
        <AppButton type="button" variant="danger" onClick={handleSignOut}>
          Sair
        </AppButton>
      </AppCard>
    );
  }

  if (view === "login") {
    return (
      <AppCard
        tone="config"
        className="maintenance-admin"
        title="Acesso administrativo"
        subtitle="Entre para liberar o sistema ou manter a manutencao ativa."
      >
        {message && <AlertMessage variant="warning">{message}</AlertMessage>}
        <form className="maintenance-form" onSubmit={handleLogin}>
          <AppField
            as="input"
            type="email"
            label="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value.toLowerCase())}
            placeholder="admin@email.com"
            required
          />
          <AppField
            as="input"
            type="password"
            label="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <AppButton type="submit" variant="primary">
            Entrar
          </AppButton>
        </form>
      </AppCard>
    );
  }

  return (
    <section className="maintenance-admin">
      <AppCard
        tone="config"
        title="Painel de manutencao"
        subtitle="Somente administradores podem liberar o acesso ao sistema."
        actions={
          <AppButton type="button" variant="secondary" onClick={handleSignOut}>
            Sair
          </AppButton>
        }
      />
      <AppCard tone="config">
        {message && <AlertMessage variant="info">{message}</AlertMessage>}
        <div className="maintenance-toggle">
          <label>
            <input
              type="checkbox"
              checked={status.maintenance_enabled}
              onChange={(e) =>
                setStatus((prev) => ({ ...prev, maintenance_enabled: e.target.checked }))
              }
            />
            Ativar modo de manutencao
          </label>
          <AppButton type="button" variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </AppButton>
        </div>
        {status.updated_at && (
          <div className="maintenance-meta">Ultima alteracao: {new Date(status.updated_at).toLocaleString()}</div>
        )}
        {!status.maintenance_enabled && (
          <AppButton as="a" href="/dashboard/admin" variant="secondary">
            Ir para o painel administrativo
          </AppButton>
        )}
      </AppCard>
    </section>
  );
}
